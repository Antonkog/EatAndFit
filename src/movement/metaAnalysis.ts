import { frameIndexOf, parseVideoStream, recordsOfKind, type ResponsesEvent } from '@meta-sam/parser';
import { getRecognitionCredentialForProvider } from '../settings/secureKeys';
import type { FormAssessment, MetaCoaching, MetaMovementAnalysis } from './types';

export const MAX_MOVEMENT_VIDEO_BYTES = 30 * 1024 * 1024;
const META_API_BASE_URL = 'https://api.meta.ai/v1';
const OUTPUT_FPS = 12;
const MAX_REP_COUNT = 200;
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const coachingSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['good_form', 'correction_needed', 'insufficient_evidence'] },
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

type AnalysisInput = {
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
  assessment: FormAssessment;
};

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
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('Wrong Meta API key.');
  if (response.status === 402) throw new Error('Meta billing is not available for this API key.');
  if (response.status === 403) throw new Error(`This Meta API key cannot use ${capability}.`);
  if (response.status === 404) throw new Error(`The Meta ${capability} model is not available for this API key or network location.`);
  if (response.status === 429) throw new Error('Meta rate limit reached. Your local workout result is safe.');
  throw new Error(payload?.error?.message || `Meta ${capability} failed. Your local workout result is safe.`);
}

async function prepareVideo(video: Blob) {
  const body = new FormData();
  const extension = video.type.includes('mp4') ? 'mp4' : video.type.includes('quicktime') ? 'mov' : 'webm';
  body.append('video', video, `exercise-set.${extension}`);
  const response = await fetch('/api/ai/movement/prepare', { method: 'POST', body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'The exercise recording could not be prepared for Meta analysis.');
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

async function uploadMetaFile(apiKey: string, video: Blob) {
  const body = new FormData();
  body.append('purpose', 'user_data');
  body.append('expires_after[anchor]', 'created_at');
  body.append('expires_after[seconds]', '3600');
  body.append('file', new File([video], 'exercise-set.mp4', { type: 'video/mp4' }));
  const response = await fetch(`${META_API_BASE_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    signal: AbortSignal.timeout(60_000),
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

async function requestSam(apiKey: string, fileId: string, media: Awaited<ReturnType<typeof videoMetadata>>) {
  const response = await fetch(`${META_API_BASE_URL}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      model: 'sam-3.1',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'person' }, { type: 'input_video', file_id: fileId }] }],
      metadata: { mask_encoding: 'one_bit' },
      stream: true,
    }),
    signal: AbortSignal.timeout(150_000),
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

function coachingPrompt(fields: AnalysisInput) {
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

function validateMuseReview(value: any, assessment: FormAssessment) {
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

async function requestMuse(apiKey: string, fileId: string, fields: AnalysisInput) {
  const response = await fetch(`${META_API_BASE_URL}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'muse-spark-1.3',
      input: [{ role: 'user', content: [{ type: 'input_text', text: coachingPrompt(fields) }, { type: 'input_file', file_id: fileId }] }],
      text: { format: { type: 'json_schema', name: 'movement_coaching', strict: true, schema: coachingSchema } },
      reasoning: { effort: 'low' },
      max_output_tokens: 4000,
    }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) return metaError(response, 'Muse movement');
  const payload = await response.json();
  const text = outputText(payload);
  if (payload.status !== 'completed' || !text.trim()) {
    throw new Error(payload?.incomplete_details?.reason === 'max_output_tokens'
      ? 'Muse could not finish reviewing this set. Try the analysis again.'
      : 'Muse did not finish reviewing this set.');
  }
  return validateMuseReview(parseJsonObject(text), fields.assessment);
}

export async function analyzeMovementWithMeta(fields: AnalysisInput): Promise<MetaMovementAnalysis> {
  const credential = await getRecognitionCredentialForProvider('META');
  if (!credential) throw new Error('Add and verify a Meta API key in Settings to analyze this set.');
  if (fields.video.size > MAX_MOVEMENT_VIDEO_BYTES) throw new Error('This exercise recording is larger than 30 MiB. Record the set again before using Meta analysis.');
  let uploadedFileId = '';
  try {
    const preparedVideo = await prepareVideo(fields.video);
    const media = await videoMetadata(preparedVideo);
    uploadedFileId = await uploadMetaFile(credential.apiKey, preparedVideo);
    const sam = await requestSam(credential.apiKey, uploadedFileId, media);
    const muse = await requestMuse(credential.apiKey, uploadedFileId, fields);
    if (fields.priorRepCount + muse.observedRepCount > MAX_REP_COUNT) throw new Error('Muse returned an invalid repetition count.');
    return {
      sam,
      countReview: {
        localRepCount: fields.priorRepCount + fields.localRepCount,
        observedRepCount: muse.observedRepCount,
        suggestedSetRepCount: fields.priorRepCount + muse.observedRepCount,
        confidence: muse.countConfidence,
      },
      coaching: muse.coaching,
      museModel: 'muse-spark-1.3',
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('Meta movement analysis timed out. Your local workout result is safe.');
    if (error instanceof TypeError) throw new Error('Meta movement analysis could not connect. Check your network or VPN and try again.');
    throw error;
  } finally {
    if (uploadedFileId) {
      await fetch(`${META_API_BASE_URL}/files/${encodeURIComponent(uploadedFileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${credential.apiKey}` },
      }).catch(() => undefined);
    }
  }
}
