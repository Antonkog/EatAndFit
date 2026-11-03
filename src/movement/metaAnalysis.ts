import { frameIndexOf, parseVideoStream, recordsOfKind, type ResponsesEvent } from '@meta-sam/parser';
import { metaTransportHeaders, metaTransportUrl } from '../ai/credentialTransport';
import { GEMINI_API_ENABLED, GEMINI_MOVEMENT_MODEL, META_API_ENABLED } from '../config/appConfig';
import { recordAiFailure, recordAiSuccess } from '../diagnostics/clientLog';
import { getRecognitionCredentialForProvider, type RecognitionCredential, type RecognitionProvider } from '../settings/secureKeys';
import type { FormAssessment, MetaCoaching, MetaMovementAnalysis } from './types';

export const MAX_MOVEMENT_VIDEO_BYTES = 30 * 1024 * 1024;
const OUTPUT_FPS = 12;
const MAX_REP_COUNT = 200;
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const coachingSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['good_form', 'correction_needed', 'insufficient_evidence', 'ai_observation'] },
    positiveObservation: nullableString,
    primaryCorrection: nullableString,
    nextSetGoal: nullableString,
    evidenceMetric: nullableString,
    observedRepCount: { type: 'integer', minimum: 0, maximum: MAX_REP_COUNT },
    countConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['status', 'positiveObservation', 'primaryCorrection', 'nextSetGoal', 'evidenceMetric', 'observedRepCount', 'countConfidence'],
  additionalProperties: false,
};

export type MovementReviewMode = 'profiled' | 'generic';
export type MovementAnalysisStage = 'preparing' | 'uploading' | 'tracking' | 'reviewing' | 'cleaning';
export const MOVEMENT_ANALYSIS_STAGE_LABELS: Record<MovementAnalysisStage, string> = {
  preparing: 'Preparing video',
  uploading: 'Uploading video',
  tracking: 'Tracking athlete with SAM 3.1',
  reviewing: 'Reviewing movement with Muse Spark 1.3',
  cleaning: 'Cleaning up',
};

type MovementReviewOptions = {
  onStage?: (stage: MovementAnalysisStage) => void;
  signal?: AbortSignal;
};

export type MovementReviewInput = {
  mode: MovementReviewMode;
  video: Blob;
  exerciseId: string;
  exerciseName: string;
  movementGuidance: string;
  setNumber: number;
  selectedRep?: { index: number; startMs: number; endMs: number };
  localRepCount: number;
  priorRepCount: number;
  repWindows: Array<{ index: number; startMs: number; endMs: number; confidence: number }>;
  activeDurationMs: number;
  assessment?: FormAssessment;
  plannedRepCount: number;
};

export interface MovementReviewProvider {
  readonly provider: RecognitionProvider;
  readonly modelLabel: string;
  analyze(input: MovementReviewInput, options?: MovementReviewOptions): Promise<MetaMovementAnalysis>;
}

class MovementAnalysisStageError extends Error {
  readonly stage: MovementAnalysisStage;
  readonly httpStatus?: number;
  readonly rawResponse?: string;

  constructor(stage: MovementAnalysisStage, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MovementAnalysisStageError';
    this.stage = stage;
    const diagnostic = cause as { httpStatus?: unknown; rawResponse?: unknown } | undefined;
    this.httpStatus = typeof diagnostic?.httpStatus === 'number' ? diagnostic.httpStatus : undefined;
    this.rawResponse = typeof diagnostic?.rawResponse === 'string' ? diagnostic.rawResponse : undefined;
  }
}

const STAGE_MODELS: Record<MovementAnalysisStage, string> = {
  preparing: 'Eat & Fit video preparation',
  uploading: 'Meta Files API',
  tracking: 'sam-3.1',
  reviewing: 'muse-spark-1.3',
  cleaning: 'Meta Files API',
};

function errorName(value: unknown) {
  return value && typeof value === 'object' && 'name' in value ? String(value.name) : '';
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value ?? 'Unknown error');
}

function stageError(stage: MovementAnalysisStage, value: unknown, timedOut: boolean) {
  if (value instanceof MovementAnalysisStageError) return value;
  const label = MOVEMENT_ANALYSIS_STAGE_LABELS[stage];
  const name = errorName(value);
  const message = errorMessage(value);
  if (timedOut || name === 'TimeoutError') {
    return new MovementAnalysisStageError(stage, `${label} timed out. Your completed workout is safe; try the analysis again.`, value);
  }
  if (name === 'AbortError' || /fetch\s+aborted|aborted|network request failed|load failed/i.test(message) || value instanceof TypeError) {
    return new MovementAnalysisStageError(stage, `${label} was interrupted by the browser or network. Your completed workout is safe; try the analysis again.`, value);
  }
  return new MovementAnalysisStageError(stage, `${label} failed: ${message}`, value);
}

async function runMovementStage<T>(
  stage: MovementAnalysisStage,
  timeoutMs: number,
  options: MovementReviewOptions,
  operation: (signal: AbortSignal) => Promise<T>,
) {
  options.onStage?.(stage);
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener('abort', forwardAbort, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('The movement analysis stage timed out.', 'TimeoutError'));
  }, timeoutMs);
  const startedAt = performance.now();
  try {
    const result = await operation(controller.signal);
    recordAiSuccess('AI movement analysis stage', {
      provider: 'META',
      model: STAGE_MODELS[stage],
      durationMs: Math.round(performance.now() - startedAt),
      detail: stage,
    });
    return result;
  } catch (value) {
    const error = stageError(stage, value, timedOut);
    recordAiFailure('AI movement analysis stage', error, {
      provider: 'META',
      model: STAGE_MODELS[stage],
      durationMs: Math.round(performance.now() - startedAt),
      detail: stage,
    }, `movement_${stage}_failed`);
    throw error;
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Muse returned an invalid coaching response.');
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch { throw new Error('Muse returned an invalid coaching response.'); }
}

function outputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  return (payload?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .filter((part: any) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('');
}

async function metaError(response: Response, capability: string): Promise<never> {
  const rawResponse = await response.text().catch(() => '');
  let payload: any = {};
  try { payload = rawResponse ? JSON.parse(rawResponse) : {}; } catch { /* preserve the raw response for diagnostics */ }
  const message = response.status === 401 ? 'Wrong Meta API key.'
    : response.status === 402 ? 'Meta billing is not available for this API key.'
    : response.status === 403 ? `This Meta API key cannot use ${capability}.`
    : response.status === 404 ? `The Meta ${capability} model is not available for this API key or network location.`
    : response.status === 429 ? 'Meta rate limit reached. Your local workout result is safe.'
    : payload?.error?.message || `Meta ${capability} failed. Your local workout result is safe.`;
  const error = new Error(message) as Error & { httpStatus?: number; rawResponse?: string };
  error.httpStatus = response.status;
  error.rawResponse = rawResponse;
  throw error;
}

async function prepareVideo(video: Blob, signal: AbortSignal) {
  const body = new FormData();
  const extension = video.type.includes('mp4') ? 'mp4' : video.type.includes('quicktime') ? 'mov' : 'webm';
  body.append('video', video, `exercise-set.${extension}`);
  const response = await fetch('/api/ai/movement/prepare', { method: 'POST', body, signal });
  if (!response.ok) {
    const rawResponse = await response.text().catch(() => '');
    let payload: any = {};
    try { payload = rawResponse ? JSON.parse(rawResponse) : {}; } catch { /* preserve raw response */ }
    const error = new Error(payload?.error || 'The exercise recording could not be prepared for Meta analysis.') as Error & { httpStatus?: number; rawResponse?: string };
    error.httpStatus = response.status;
    error.rawResponse = rawResponse;
    throw error;
  }
  return response.blob();
}

async function videoMetadata(videoBlob: Blob) {
  const url = URL.createObjectURL(videoBlob);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The prepared exercise video is not readable.'));
    });
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadMetaFile(credential: RecognitionCredential, video: Blob, signal: AbortSignal) {
  const body = new FormData();
  body.append('purpose', 'user_data');
  body.append('expires_after[anchor]', 'created_at');
  body.append('expires_after[seconds]', '3600');
  body.append('file', new File([video], 'exercise-set.mp4', { type: 'video/mp4' }));
  const response = await fetch(metaTransportUrl(credential, '/files'), {
    method: 'POST',
    headers: metaTransportHeaders(credential),
    body,
    signal,
  });
  if (!response.ok) return metaError(response, 'file upload');
  const payload = await response.json();
  if (typeof payload?.id !== 'string') throw new Error('Meta did not return a file identifier.');
  return payload.id as string;
}

async function* responseEvents(response: Response): AsyncIterable<ResponsesEvent> {
  if (!response.body) throw new Error('SAM 3.1 returned an empty stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        yield JSON.parse(data) as ResponsesEvent;
      }
      if (done) {
        const finalLine = buffer.trim();
        if (finalLine.startsWith('data:')) {
          const data = finalLine.slice(5).trim();
          if (data && data !== '[DONE]') yield JSON.parse(data) as ResponsesEvent;
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function requestSam(credential: RecognitionCredential, fileId: string, media: Awaited<ReturnType<typeof videoMetadata>>, signal: AbortSignal) {
  const response = await fetch(metaTransportUrl(credential, '/responses'), {
    method: 'POST',
    headers: metaTransportHeaders(credential, { 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
    body: JSON.stringify({
      model: 'sam-3.1',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'person' }, { type: 'input_video', file_id: fileId }] }],
      metadata: { mask_encoding: 'one_bit' },
      stream: true,
    }),
    signal,
  });
  if (!response.ok) return metaError(response, 'SAM 3.1 movement');
  const result = await parseVideoStream(responseEvents(response)).finalResult;
  if (result.outcome.status !== 'completed') throw new Error('SAM 3.1 did not finish tracking the exercise set.');
  const boxes = recordsOfKind(result.records, 'box');
  const objectIds = new Set(boxes.map((box) => box.objectId));
  if (objectIds.size > 1) throw new Error('More than one person was detected. Record again with only the athlete in frame.');
  if (!boxes.length) throw new Error('SAM 3.1 could not track the athlete in this set.');
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
  const confidences = boxes.map((box) => box.confidence).filter(Number.isFinite) as number[];
  return {
    model: 'sam-3.1',
    coverage: Math.min(1, trackedFrames / expectedFrames),
    confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    sourceWidth: media.width,
    sourceHeight: media.height,
    boxes: sampled,
  };
}

function coachingPrompt(fields: MovementReviewInput) {
  if (fields.mode === 'generic') {
    return `You are the AI video-review layer for Eat & Fit. Review the complete exercise set and independently count visible, completed movement cycles. This exercise has no validated on-device movement profile, so do not claim joint angles, range-of-motion measurements, numerical scores, medical conclusions, or deterministic tracking evidence.

Exercise ID: ${fields.exerciseId}
Exercise: ${fields.exerciseName}
Catalog guidance and common mistakes: ${fields.movementGuidance}
Set: ${fields.setNumber}
Planned repetitions: ${fields.plannedRepCount}
Active recording duration: ${fields.activeDurationMs} ms

Return status ai_observation. Provide one concise observation based on the visible video and at most one practical next-set tip. Use positiveObservation for the observation, primaryCorrection only when a clear non-medical technique adjustment is visible, and nextSetGoal for the next-set tip. evidenceMetric must be null. Count only completed cycles clearly visible in this uploaded set. If the set cannot be counted reliably, return the best conservative count and low confidence.`;
  }
  return `You are the Meta video-review layer for Eat & Fit. Review the complete exercise set and independently count visible, completed movement cycles. The application's MediaPipe count is context, not an answer to copy. Do not change the supplied assessment status, invent measurements, create scores, make medical claims, or criticize good form.

Exercise ID: ${fields.exerciseId}
Exercise: ${fields.exerciseName}
Validated movement guidance: ${fields.movementGuidance}
Set: ${fields.setNumber}; selected rep: ${fields.selectedRep?.index || 'none'}
MediaPipe repetitions visible in this uploaded segment: ${fields.localRepCount}
Repetitions completed before this uploaded segment: ${fields.priorRepCount}
Active segment duration: ${fields.activeDurationMs} ms
MediaPipe repetition windows: ${JSON.stringify(fields.repWindows)}
Authoritative application assessment:
${JSON.stringify(fields.assessment)}

Count only complete repetitions visible in the uploaded segment; do not include prior repetitions. If the set cannot be counted reliably, return the best conservative observed count with low confidence. For good_form, give one concise positive observation and no correction. For correction_needed, give exactly one actionable correction tied to a supplied evidence metric. For insufficient_evidence, do not judge technique or give a correction; explain camera placement in nextSetGoal.`;
}

function validateMuseReview(value: any, fields: MovementReviewInput) {
  if (fields.mode === 'generic') {
    if (!value || value.status !== 'ai_observation') throw new Error('Muse returned an invalid generic exercise review.');
    const coaching: MetaCoaching = {
      status: 'ai_observation',
      positiveObservation: typeof value.positiveObservation === 'string' && value.positiveObservation.trim() ? value.positiveObservation.trim() : null,
      primaryCorrection: typeof value.primaryCorrection === 'string' && value.primaryCorrection.trim() ? value.primaryCorrection.trim() : null,
      nextSetGoal: typeof value.nextSetGoal === 'string' && value.nextSetGoal.trim() ? value.nextSetGoal.trim() : null,
      evidenceMetric: null,
    };
    if (!coaching.positiveObservation || !coaching.nextSetGoal) throw new Error('Muse did not return a complete AI observation.');
    const observedRepCount = Number(value.observedRepCount);
    if (!Number.isInteger(observedRepCount) || observedRepCount < 0 || observedRepCount > MAX_REP_COUNT) throw new Error('Muse returned an invalid repetition count.');
    if (!['low', 'medium', 'high'].includes(value.countConfidence)) throw new Error('Muse returned invalid count confidence.');
    return { coaching, observedRepCount, countConfidence: value.countConfidence as 'low' | 'medium' | 'high' };
  }
  const assessment = fields.assessment;
  if (!assessment) throw new Error('The local form assessment is missing.');
  if (!value || value.status !== assessment.status) throw new Error('Muse returned coaching that contradicted the measured assessment.');
  const coaching: MetaCoaching = {
    status: value.status,
    positiveObservation: typeof value.positiveObservation === 'string' && value.positiveObservation.trim() ? value.positiveObservation.trim() : null,
    primaryCorrection: typeof value.primaryCorrection === 'string' && value.primaryCorrection.trim() ? value.primaryCorrection.trim() : null,
    nextSetGoal: typeof value.nextSetGoal === 'string' && value.nextSetGoal.trim() ? value.nextSetGoal.trim() : null,
    evidenceMetric: typeof value.evidenceMetric === 'string' && value.evidenceMetric.trim() ? value.evidenceMetric.trim() : null,
  };
  if (assessment.status === 'good_form' && (!coaching.positiveObservation || coaching.primaryCorrection)) throw new Error('Muse invented a correction for a good repetition.');
  if (assessment.status === 'correction_needed' && (!coaching.primaryCorrection || !coaching.evidenceMetric)) throw new Error('Muse did not return one evidence-based correction.');
  if (assessment.status === 'insufficient_evidence' && (coaching.positiveObservation || coaching.primaryCorrection)) throw new Error('Muse judged technique without sufficient evidence.');
  if (coaching.evidenceMetric) {
    const reference = coaching.evidenceMetric.toLowerCase();
    const supported = assessment.evidence.some((item) => reference.includes(item.label.toLowerCase()) || reference.includes(item.metric.toLowerCase()));
    if (!supported) throw new Error('Muse referenced a measurement that Eat & Fit did not supply.');
  }
  const observedRepCount = Number(value.observedRepCount);
  if (!Number.isInteger(observedRepCount) || observedRepCount < 0 || observedRepCount > MAX_REP_COUNT) throw new Error('Muse returned an invalid repetition count.');
  if (!['low', 'medium', 'high'].includes(value.countConfidence)) throw new Error('Muse returned invalid count confidence.');
  return { coaching, observedRepCount, countConfidence: value.countConfidence as 'low' | 'medium' | 'high' };
}

async function requestMuse(credential: RecognitionCredential, fileId: string, fields: MovementReviewInput, signal: AbortSignal) {
  const response = await fetch(metaTransportUrl(credential, '/responses'), {
    method: 'POST',
    headers: metaTransportHeaders(credential, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: 'muse-spark-1.3',
      input: [{ role: 'user', content: [{ type: 'input_text', text: coachingPrompt(fields) }, { type: 'input_file', file_id: fileId }] }],
      text: { format: { type: 'json_schema', name: 'movement_coaching', strict: true, schema: coachingSchema } },
      reasoning: { effort: 'low' },
      max_output_tokens: 4000,
    }),
    signal,
  });
  if (!response.ok) return metaError(response, 'Muse movement');
  const payload = await response.json();
  const text = outputText(payload);
  if (payload.status !== 'completed' || !text.trim()) {
    throw new Error(payload?.incomplete_details?.reason === 'max_output_tokens'
      ? 'Muse could not finish reviewing this set. Try the analysis again.'
      : 'Muse did not finish reviewing this set.');
  }
  return validateMuseReview(parseJsonObject(text), fields);
}

async function analyzeMovementWithMetaTransport(fields: MovementReviewInput, options: MovementReviewOptions = {}): Promise<MetaMovementAnalysis> {
  const credential = await getRecognitionCredentialForProvider('META');
  if (!credential) throw new Error('Meta movement analysis is unavailable.');
  if (fields.video.size > MAX_MOVEMENT_VIDEO_BYTES) throw new Error('This exercise recording is larger than 30 MiB. Record the set again before using Meta analysis.');
  let uploadedFileId = '';
  try {
    const { preparedVideo, media } = await runMovementStage('preparing', 60_000, options, async (signal) => {
      const video = await prepareVideo(fields.video, signal);
      return { preparedVideo: video, media: await videoMetadata(video) };
    });
    uploadedFileId = await runMovementStage('uploading', 90_000, options, (signal) => uploadMetaFile(credential, preparedVideo, signal));
    const sam = await runMovementStage('tracking', 180_000, options, (signal) => requestSam(credential, uploadedFileId, media, signal));
    const muse = await runMovementStage('reviewing', 180_000, options, (signal) => requestMuse(credential, uploadedFileId, fields, signal));
    if (fields.priorRepCount + muse.observedRepCount > MAX_REP_COUNT) throw new Error('Muse returned an invalid repetition count.');
    return {
      provider: 'META',
      sam,
      countReview: {
        baselineKind: fields.mode === 'generic' ? 'planned' : 'mediapipe',
        baselineRepCount: fields.mode === 'generic' ? fields.plannedRepCount : fields.priorRepCount + fields.localRepCount,
        localRepCount: fields.priorRepCount + fields.localRepCount,
        observedRepCount: muse.observedRepCount,
        suggestedSetRepCount: fields.priorRepCount + muse.observedRepCount,
        confidence: muse.countConfidence,
      },
      coaching: muse.coaching,
      museModel: 'muse-spark-1.3',
      processedAt: new Date().toISOString(),
    };
  } finally {
    if (uploadedFileId) {
      await runMovementStage('cleaning', 30_000, { onStage: options.onStage }, async (signal) => {
        const response = await fetch(metaTransportUrl(credential, `/files/${encodeURIComponent(uploadedFileId)}`), {
          method: 'DELETE',
          headers: metaTransportHeaders(credential),
          signal,
        });
        if (!response.ok) return metaError(response, 'temporary-file cleanup');
      }).catch(() => undefined);
    }
  }
}

class MetaMovementReviewProvider implements MovementReviewProvider {
  readonly provider = 'META' as const;
  readonly modelLabel = 'SAM 3.1 + Muse Spark 1.3';
  analyze(input: MovementReviewInput, options?: MovementReviewOptions) { return analyzeMovementWithMetaTransport(input, options); }
}

class GeminiMovementReviewProvider implements MovementReviewProvider {
  readonly provider = 'GEMINI' as const;
  readonly modelLabel = GEMINI_MOVEMENT_MODEL || 'Gemini movement model';
  async analyze(_input: MovementReviewInput, _options?: MovementReviewOptions): Promise<MetaMovementAnalysis> {
    throw new Error(GEMINI_MOVEMENT_MODEL
      ? 'Gemini movement review is prepared but not implemented in this build.'
      : 'GEMINI_MOVEMENT_MODEL is not configured in this build.');
  }
}

export function createMovementReviewProvider(provider: RecognitionProvider): MovementReviewProvider {
  if (provider === 'META' && META_API_ENABLED) return new MetaMovementReviewProvider();
  if (provider === 'GEMINI' && GEMINI_API_ENABLED) return new GeminiMovementReviewProvider();
  throw new Error('The selected AI movement provider is disabled in this build.');
}

/** Backward-compatible Meta entry point used by the existing profiled-session tests. */
export async function analyzeMovementWithMeta(input: MovementReviewInput, options?: MovementReviewOptions): Promise<MetaMovementAnalysis> {
  return new MetaMovementReviewProvider().analyze(input, options);
}
