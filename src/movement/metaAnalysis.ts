import { getRecognitionCredentialForProvider } from '../settings/secureKeys';
import type { FormAssessment, MetaMovementAnalysis } from './types';

export async function analyzeMovementWithMeta({
  video,
  exerciseId,
  exerciseName,
  movementGuidance,
  setNumber,
  selectedRep,
  assessment,
  videoWidth,
  videoHeight,
}: {
  video: Blob;
  exerciseId: string;
  exerciseName: string;
  movementGuidance: string;
  setNumber: number;
  selectedRep: { index: number; startMs: number; endMs: number };
  assessment: FormAssessment;
  videoWidth: number;
  videoHeight: number;
}) {
  const credential = await getRecognitionCredentialForProvider('META');
  if (!credential) throw new Error('Add and verify a Meta API key in Settings to analyze this rep.');
  const body = new FormData();
  body.append('video', video, 'exercise-set.webm');
  body.append('exerciseId', exerciseId);
  body.append('exerciseName', exerciseName);
  body.append('movementGuidance', movementGuidance);
  body.append('setNumber', String(setNumber));
  body.append('selectedRep', String(selectedRep.index));
  body.append('repStartMs', String(selectedRep.startMs));
  body.append('repEndMs', String(selectedRep.endMs));
  body.append('videoWidth', String(videoWidth));
  body.append('videoHeight', String(videoHeight));
  body.append('assessment', JSON.stringify(assessment));
  body.append('adultConfirmed', 'true');
  const response = await fetch('/api/ai/movement/analyze', {
    method: 'POST',
    headers: { authorization: `Bearer ${credential.apiKey}` },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Meta movement analysis failed.');
  return payload as MetaMovementAnalysis;
}

