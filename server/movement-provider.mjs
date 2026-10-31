import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import Busboy from 'busboy';
import OpenAI from 'openai';
import { frameIndexOf, parseVideoStream, recordsOfKind } from '@meta-sam/parser';

const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_SET_MS = 90_000;
const MIN_REP_MS = 800;
const MAX_REP_MS = 12_000;
const OUTPUT_FPS = 12;
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const coachingSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['good_form', 'correction_needed', 'insufficient_evidence'] },
    positiveObservation: nullableString,
    primaryCorrection: nullableString,
    nextSetGoal: nullableString,
    evidenceMetric: nullableString,
  },
  required: ['status', 'positiveObservation', 'primaryCorrection', 'nextSetGoal', 'evidenceMetric'],
  additionalProperties: false,
};

export class MovementAnalysisError extends Error {
  constructor(message, status = 400, code = 'invalid_movement_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function bearerKey(request) {
  const match = String(request.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]?.trim()) throw new MovementAnalysisError('Add and verify a Meta API key in Settings first.', 401, 'missing_meta_key');
  return match[1].trim();
}

function numeric(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new MovementAnalysisError(`${label} is invalid.`);
  return number;
}

const statuses = new Set(['good_form', 'correction_needed', 'insufficient_evidence']);

export function validateAssessment(value) {
  if (!value || typeof value !== 'object' || !statuses.has(value.status) || !Array.isArray(value.evidence)) {
    throw new MovementAnalysisError('The local form assessment is invalid.');
  }
  for (const evidence of value.evidence) {
    if (!evidence || typeof evidence.metric !== 'string' || typeof evidence.label !== 'string' || !Number.isFinite(Number(evidence.value)) || typeof evidence.unit !== 'string') {
      throw new MovementAnalysisError('Movement evidence is invalid.');
    }
  }
  if (value.status === 'correction_needed' && typeof value.issue !== 'string') throw new MovementAnalysisError('A supported form issue is required.');
  if (value.status === 'insufficient_evidence' && typeof value.reason !== 'string') throw new MovementAnalysisError('A tracking failure reason is required.');
  return value;
}

export function validateMovementFields(fields) {
  const startMs = numeric(fields.repStartMs, 'Rep start');
  const endMs = numeric(fields.repEndMs, 'Rep end');
  const durationMs = endMs - startMs;
  if (startMs < 0 || endMs > MAX_SET_MS || durationMs < MIN_REP_MS || durationMs > MAX_REP_MS) throw new MovementAnalysisError('The selected repetition window must be between 0.8 and 12 seconds.');
  if (fields.adultConfirmed !== 'true') throw new MovementAnalysisError('Meta movement analysis is available only for confirmed adults.', 403, 'adult_required');
  const assessment = validateAssessment(JSON.parse(fields.assessment ?? '{}'));
  const exerciseId = String(fields.exerciseId ?? '').trim().slice(0, 150);
  const exerciseName = String(fields.exerciseName ?? '').trim().slice(0, 150);
  const movementGuidance = String(fields.movementGuidance ?? '').trim().slice(0, 800);
  if (!exerciseId || !exerciseName || !movementGuidance) throw new MovementAnalysisError('Exercise identity and movement guidance are required.');
  return {
    exerciseId,
    exerciseName,
    movementGuidance,
    setNumber: Math.max(1, Math.round(numeric(fields.setNumber, 'Set number'))),
    selectedRep: Math.max(1, Math.round(numeric(fields.selectedRep, 'Selected rep'))),
    startMs,
    endMs,
    assessment,
  };
}

export function validateCoaching(value, assessment) {
  if (!value || typeof value !== 'object' || value.status !== assessment.status) throw new MovementAnalysisError('Muse returned coaching that contradicted the measured assessment.', 502, 'invalid_muse_response');
  const coaching = {
    status: value.status,
    positiveObservation: typeof value.positiveObservation === 'string' && value.positiveObservation.trim() ? value.positiveObservation.trim() : null,
    primaryCorrection: typeof value.primaryCorrection === 'string' && value.primaryCorrection.trim() ? value.primaryCorrection.trim() : null,
    nextSetGoal: typeof value.nextSetGoal === 'string' && value.nextSetGoal.trim() ? value.nextSetGoal.trim() : null,
    evidenceMetric: typeof value.evidenceMetric === 'string' && value.evidenceMetric.trim() ? value.evidenceMetric.trim() : null,
  };
  if (assessment.status === 'good_form' && (!coaching.positiveObservation || coaching.primaryCorrection)) throw new MovementAnalysisError('Muse invented a correction for a good rep.', 502, 'invalid_muse_response');
  if (assessment.status === 'correction_needed' && (!coaching.primaryCorrection || !coaching.evidenceMetric)) throw new MovementAnalysisError('Muse did not return one evidence-based correction.', 502, 'invalid_muse_response');
  if (assessment.status === 'insufficient_evidence' && (coaching.positiveObservation || coaching.primaryCorrection)) throw new MovementAnalysisError('Muse judged technique without sufficient evidence.', 502, 'invalid_muse_response');
  if (coaching.evidenceMetric) {
    const reference = coaching.evidenceMetric.toLowerCase();
    const supported = assessment.evidence.some((item) => reference.includes(item.label.toLowerCase()) || reference.includes(item.metric.toLowerCase()));
    if (!supported) throw new MovementAnalysisError('Muse referenced a measurement that Eat & Fit did not supply.', 502, 'invalid_muse_response');
  }
  return coaching;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      process.kill('SIGKILL');
      reject(new MovementAnalysisError('Video processing timed out.', 422, 'video_processing_timeout'));
    }, 30_000);
    process.stdout.on('data', (chunk) => stdout.push(chunk));
    process.stderr.on('data', (chunk) => stderr.push(chunk));
    process.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    process.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'));
      else reject(new MovementAnalysisError(`Video processing failed: ${Buffer.concat(stderr).toString('utf8').slice(-300)}`, 422, 'video_processing_failed'));
    });
  });
}

async function convertSelectedRep(inputPath, outputPath, startMs, endMs) {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(startMs / 1000), '-t', String((endMs - startMs) / 1000), '-i', inputPath,
    '-an', '-vf', `fps=${OUTPUT_FPS},scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath,
  ]);
}

async function probeVideo(path) {
  const output = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', path]);
  const stream = JSON.parse(output).streams?.[0];
  if (!stream?.width || !stream?.height) throw new MovementAnalysisError('The selected clip has no readable video track.', 422, 'invalid_video');
  return { width: stream.width, height: stream.height, duration: Number(stream.duration) || 0 };
}

function parseJsonObject(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new MovementAnalysisError('Muse returned an invalid coaching response.', 502, 'invalid_muse_response');
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch { throw new MovementAnalysisError('Muse returned an invalid coaching response.', 502, 'invalid_muse_response'); }
}

function coachingPrompt(fields) {
  return `You are the language layer for Eat & Fit movement coaching. The application already measured and classified this repetition. Do not change its status, invent measurements, count repetitions, create scores, make medical claims, or criticize good form.

Exercise ID: ${fields.exerciseId}
Exercise: ${fields.exerciseName}
Validated movement guidance: ${fields.movementGuidance}
Set: ${fields.setNumber}; selected rep: ${fields.selectedRep}
Authoritative application assessment:
${JSON.stringify(fields.assessment)}

Return ONLY this JSON object:
{"status":"good_form|correction_needed|insufficient_evidence","positiveObservation":string|null,"primaryCorrection":string|null,"nextSetGoal":string|null,"evidenceMetric":string|null}

For good_form: give one concise positive observation, primaryCorrection must be null, and optionally reinforce the same technique. For correction_needed: give exactly one actionable correction tied to one supplied evidence metric. evidenceMetric must include the exact label of a supplied evidence item. For insufficient_evidence: do not judge technique and give no correction; nextSetGoal should explain camera placement.`;
}

async function requestSam(client, fileId, media) {
  const stream = await client.responses.create({
    model: 'sam-3.1',
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'person' }, { type: 'input_video', file_id: fileId }] }],
    metadata: { mask_encoding: 'one_bit' },
    stream: true,
  });
  const result = await parseVideoStream(stream).finalResult;
  if (result.outcome.status !== 'completed') throw new MovementAnalysisError('SAM 3.1 did not finish tracking the selected rep.', 502, 'sam_incomplete');
  const boxes = recordsOfKind(result.records, 'box');
  const objectIds = new Set(boxes.map((box) => box.objectId));
  if (objectIds.size > 1) throw new MovementAnalysisError('More than one person was detected. Record again with only the athlete in frame.', 422, 'multiple_people');
  if (!boxes.length) throw new MovementAnalysisError('SAM 3.1 could not track the athlete in this rep.', 422, 'person_not_tracked');
  const sampleEvery = Math.max(1, Math.ceil(boxes.length / 60));
  const sampled = boxes.filter((_, index) => index % sampleEvery === 0).map((box) => ({
    timestampMs: Math.round((frameIndexOf(box) ?? 0) / OUTPUT_FPS * 1000),
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  }));
  const expectedFrames = Math.max(1, Math.round(media.duration * OUTPUT_FPS));
  const trackedFrames = new Set(boxes.map((box) => frameIndexOf(box)).filter(Number.isFinite)).size;
  const confidences = boxes.map((box) => box.confidence).filter(Number.isFinite);
  return {
    model: 'sam-3.1',
    coverage: Math.min(1, trackedFrames / expectedFrames),
    confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    sourceWidth: media.width,
    sourceHeight: media.height,
    boxes: sampled,
  };
}

async function requestMuse(client, fileId, fields) {
  const response = await client.responses.create({
    model: 'muse-spark-1.3',
    input: [{ role: 'user', content: [{ type: 'input_text', text: coachingPrompt(fields) }, { type: 'input_file', file_id: fileId }] }],
    text: { format: { type: 'json_schema', name: 'movement_coaching', strict: true, schema: coachingSchema } },
    reasoning: { effort: 'low' },
    max_output_tokens: 500,
  });
  return validateCoaching(parseJsonObject(response.output_text), fields.assessment);
}

function receiveMultipart(request, directory) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fields = {};
    let videoPath;
    let videoMime;
    let videoPromise = Promise.resolve();
    const fail = (error) => { if (!settled) { settled = true; reject(error); } };
    let busboy;
    try { busboy = Busboy({ headers: request.headers, limits: { files: 1, fileSize: MAX_VIDEO_BYTES, fields: 12, fieldSize: 200_000 } }); }
    catch { reject(new MovementAnalysisError('Use multipart form data for movement analysis.')); return; }
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('file', (name, file, info) => {
      if (name !== 'video' || videoPath) { file.resume(); return; }
      const extension = info.mimeType.includes('mp4') ? 'mp4' : 'webm';
      if (!['video/webm', 'video/mp4', 'video/quicktime'].includes(info.mimeType)) { file.resume(); fail(new MovementAnalysisError('Use a WebM, MP4, or MOV exercise video.', 415, 'unsupported_video')); return; }
      videoMime = info.mimeType;
      videoPath = join(directory, `source.${extension}`);
      videoPromise = new Promise((fileResolve, fileReject) => {
        const output = createWriteStreamCompat(videoPath);
        file.on('limit', () => fileReject(new MovementAnalysisError('The exercise video must be 30 MiB or smaller.', 413, 'video_too_large')));
        file.on('error', fileReject);
        output.on('error', fileReject);
        output.on('finish', fileResolve);
        file.pipe(output);
      });
    });
    busboy.on('error', fail);
    request.on('aborted', () => fail(new MovementAnalysisError('The movement upload was interrupted.', 499, 'upload_interrupted')));
    request.on('error', fail);
    busboy.on('finish', async () => {
      try {
        await videoPromise;
        if (!videoPath) throw new MovementAnalysisError('Attach an exercise video.');
        if (!settled) { settled = true; resolve({ fields, videoPath, videoMime }); }
      } catch (error) { fail(error); }
    });
    request.pipe(busboy);
  });
}

// Kept behind a tiny helper so the multipart parser remains easy to replace or test.
function createWriteStreamCompat(path) { return createWriteStream(path, { flags: 'wx' }); }

export async function analyzeMovementRequest(request, { clientFactory = (apiKey) => new OpenAI({ apiKey, baseURL: 'https://api.meta.ai/v1', timeout: 150_000, maxRetries: 0 }) } = {}) {
  const apiKey = bearerKey(request);
  const directory = await mkdtemp(join(tmpdir(), 'eatfit-movement-'));
  let uploadedFileId;
  let client;
  try {
    const { fields, videoPath } = await receiveMultipart(request, directory);
    const validated = validateMovementFields(fields);
    const sourceMedia = await probeVideo(videoPath);
    if (sourceMedia.duration > MAX_SET_MS / 1000) throw new MovementAnalysisError('The exercise recording must be 90 seconds or shorter.', 413, 'video_too_long');
    const clipPath = join(directory, 'selected-rep.mp4');
    await convertSelectedRep(videoPath, clipPath, validated.startMs, validated.endMs);
    const media = await probeVideo(clipPath);
    client = clientFactory(apiKey);
    const uploaded = await client.files.create({ file: createReadStream(clipPath), purpose: 'user_data', expires_after: { anchor: 'created_at', seconds: 3600 } });
    uploadedFileId = uploaded.id;
    const [samResult, coachingResult] = await Promise.allSettled([
      requestSam(client, uploadedFileId, media),
      requestMuse(client, uploadedFileId, validated),
    ]);
    if (samResult.status === 'rejected') throw samResult.reason;
    if (coachingResult.status === 'rejected') throw coachingResult.reason;
    const sam = samResult.value;
    const coaching = coachingResult.value;
    return { sam, coaching, museModel: 'muse-spark-1.3', processedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof MovementAnalysisError) throw error;
    if (error?.status === 401) throw new MovementAnalysisError('Wrong Meta API key.', 401, 'wrong_meta_key');
    if (error?.status === 429) throw new MovementAnalysisError('Meta rate limit reached. Your local workout result is safe.', 429, 'meta_rate_limit');
    throw new MovementAnalysisError('Meta movement analysis is temporarily unavailable. Your local workout result is safe.', 502, 'meta_unavailable');
  } finally {
    if (uploadedFileId && client) await client.files.delete(uploadedFileId).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

