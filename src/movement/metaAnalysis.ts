import { getRecognitionCredentialForProvider } from '../settings/secureKeys';
import type { FormAssessment, MetaMovementAnalysis } from './types';

export const MAX_MOVEMENT_VIDEO_BYTES = 30 * 1024 * 1024;

export async function analyzeMovementWithMeta({
  video,
  exerciseId,
  exerciseName,
  movementGuidance,
  setNumber,
  selectedRep,
  localRepCount,
  priorRepCount,
  repWindows,
  activeDurationMs,
  assessment,
}: {
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
}) {
  const credential = await getRecognitionCredentialForProvider('META');
  if (!credential) throw new Error('Add and verify a Meta API key in Settings to analyze this set.');
  if (video.size > MAX_MOVEMENT_VIDEO_BYTES) throw new Error('This exercise recording is larger than 30 MiB. Record the set again before using Meta analysis.');
  const body = new FormData();
  body.append('video', video, video.type.includes('mp4') ? 'exercise-set.mp4' : 'exercise-set.webm');
  body.append('exerciseId', exerciseId);
  body.append('exerciseName', exerciseName);
  body.append('movementGuidance', movementGuidance);
  body.append('setNumber', String(setNumber));
  body.append('selectedRep', String(selectedRep?.index ?? 0));
  body.append('repStartMs', String(selectedRep?.startMs ?? 0));
  body.append('repEndMs', String(selectedRep?.endMs ?? 0));
  body.append('localRepCount', String(localRepCount));
  body.append('priorRepCount', String(priorRepCount));
  body.append('repWindows', JSON.stringify(repWindows));
  body.append('activeDurationMs', String(activeDurationMs));
  body.append('assessment', JSON.stringify(assessment));
  body.append('adultConfirmed', 'true');
  const response = await fetch('/api/ai/movement/analyze', {
    method: 'POST',
    headers: { authorization: `Bearer ${credential.apiKey}` },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) throw new Error(payload?.error || 'This exercise recording is too large for Meta analysis. Record the set again.');
    if (response.status === 401 || response.status === 403) throw new Error(payload?.error || 'The Meta API key could not authorize movement analysis.');
    if (response.status === 408 || response.status === 504) throw new Error(payload?.error || 'Meta movement analysis timed out. Your local workout result is safe.');
    throw new Error(payload?.error || 'Meta movement analysis is temporarily unavailable. Your local workout result is safe.');
  }
  return payload as MetaMovementAnalysis;
}

