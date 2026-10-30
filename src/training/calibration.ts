import { requestMetaChat, throwMetaRequestError } from '../ai/metaChat';
import { estimateExerciseEnergy } from '../energy/estimates';
import { ENERGY_SOURCE_REGISTRY_VERSION } from '../energy/sources';
import type { ExerciseCatalog } from '../exercises/types';
import type { UserProfile } from '../profile/userProfile';
import type { RecognitionCredential } from '../settings/secureKeys';
import type { CalibrationResponse } from './types';
import { calibrationFactor } from './validation';

const STORAGE_KEY = 'eat-and-fit:energy-calibration';
const CALIBRATION_MODEL_VERSION = 'meta-muse-spark-1.3__gemini-3.1-flash-lite__v1';
export const ENERGY_CALIBRATION_CHANGED = 'eatfit-energy-calibration-change';
const benchmarkIds = ['freeexercise:1435', 'freeexercise:0300', 'freeexercise:0025', 'freeexercise:drv-chin-ups-pull-ups', 'freeexercise:0553'];

type StoredCalibration = { fingerprint: string; factor: number; provider: string; createdAt: string };

function fingerprint(profile: UserProfile, credential: Pick<RecognitionCredential, 'provider'>) {
  return JSON.stringify({ source: ENERGY_SOURCE_REGISTRY_VERSION, models: CALIBRATION_MODEL_VERSION, provider: credential.provider, age: profile.age, sex: profile.sex, weightKg: profile.weightKg, heightCm: profile.heightCm, goal: profile.trainingGoal });
}

export function readEnergyCalibration(profile: UserProfile, provider?: string) {
  if (typeof localStorage === 'undefined' || !provider) return undefined;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredCalibration | null;
    if (!stored || stored.fingerprint !== fingerprint(profile, { provider } as RecognitionCredential)) return undefined;
    return stored.factor >= 0.5 && stored.factor <= 1.5 ? stored.factor : undefined;
  } catch {
    return undefined;
  }
}

export function clearEnergyCalibration() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(ENERGY_CALIBRATION_CHANGED));
}

function benchmarkBaselines(catalog: ExerciseCatalog, profile: UserProfile) {
  return benchmarkIds.map((exerciseId) => {
    const exercise = catalog.exercises.find((item) => item.id === exerciseId);
    if (!exercise) throw new Error(`Calibration exercise ${exerciseId} is missing from the catalog.`);
    const estimate = estimateExerciseEnergy(exercise, Array.from({ length: 3 }, () => ({ reps: 10 })), profile);
    if (!estimate) throw new Error('The profile cannot be used for adult calorie calibration.');
    return { exerciseId, exerciseName: exercise.name, calories: estimate.calories, durationMinutes: estimate.durationMinutes, sourceCode: estimate.source.activityCode };
  });
}

async function requestMetaCalibration(profile: UserProfile, baselines: ReturnType<typeof benchmarkBaselines>, apiKey: string) {
  const { response, body } = await requestMetaChat(apiKey, {
    temperature: 0,
    messages: [
      { role: 'system', content: 'You calibrate exercise-energy estimates conservatively. Return JSON only.' },
      { role: 'user', content: `Return {"corrections":[{"exerciseId":"...","calories":number}]} with exactly one corrected calorie value for each baseline. Keep each correction within 50–150% of its baseline. Profile: ${JSON.stringify(profile)}. Baselines: ${JSON.stringify(baselines)}` },
    ],
    response_format: { type: 'json_object' },
  });
  throwMetaRequestError(response, body, 'exercise-energy calibration');
  try { return JSON.parse(body?.choices?.[0]?.message?.content ?? '') as CalibrationResponse; }
  catch { throw new Error('Meta returned an invalid calibration response.'); }
}

async function requestGeminiCalibration(profile: UserProfile, baselines: ReturnType<typeof benchmarkBaselines>, credential: RecognitionCredential) {
  const response = await fetch('/api/ai/training/calibrate', {
    method: 'POST',
    headers: { authorization: `Bearer ${credential.apiKey}`, 'content-type': 'application/json', 'x-recognition-provider': credential.provider },
    body: JSON.stringify({ profile, baselines }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'AI calibration failed.');
  return body as CalibrationResponse;
}

let pendingCalibration: Promise<number> | undefined;

export async function ensureEnergyCalibration(catalog: ExerciseCatalog, profile: UserProfile, credential: RecognitionCredential) {
  if (!profile.age || profile.age < 19) return undefined;
  const existing = readEnergyCalibration(profile, credential.provider);
  if (existing) return existing;
  if (pendingCalibration) return pendingCalibration;
  pendingCalibration = (async () => {
    const baselines = benchmarkBaselines(catalog, profile);
    const result = credential.provider === 'META'
      ? await requestMetaCalibration(profile, baselines, credential.apiKey)
      : await requestGeminiCalibration(profile, baselines, credential);
    const factor = calibrationFactor(baselines, result.corrections);
    const value: StoredCalibration = { fingerprint: fingerprint(profile, credential), factor, provider: credential.provider, createdAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new Event(ENERGY_CALIBRATION_CHANGED));
    return factor;
  })();
  try { return await pendingCalibration; }
  finally { pendingCalibration = undefined; }
}
