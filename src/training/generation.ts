import { requestMetaChat, throwMetaRequestError } from '../ai/metaChat';
import type { ExerciseCatalog } from '../exercises/types';
import type { TrainingGoal, UserProfile } from '../profile/userProfile';
import type { RecognitionCredential } from '../settings/secureKeys';
import type { GeneratedTrainingPlan } from './types';
import { validateGeneratedTrainingPlan } from './validation';

function requestBody(profile: UserProfile, goal: TrainingGoal, catalog: ExerciseCatalog) {
  return {
    profile: { age: profile.age, sex: profile.sex, weightKg: profile.weightKg, heightCm: profile.heightCm, goal },
    catalog: catalog.exercises.map(({ id, name, body_part, target, equipment, difficulty }) => ({ id, name, body_part, target, equipment, difficulty })),
  };
}

function prompt(value: ReturnType<typeof requestBody>) {
  return [
    'Create a safe two-week gym plan for this adult profile using only exercise IDs from the supplied catalog.',
    'Return JSON: {goal, sessions:[{title, exercises:[{exerciseId,sets,reps,durationMinutes?}]}]}.',
    'Return exactly six sessions. Each session must contain 5–7 exercises. Use 1–8 sets and either repetitions or estimated activity minutes per set. Do not invent IDs.',
    `Input: ${JSON.stringify(value)}`,
  ].join('\n');
}

export async function generateTrainingPlan(profile: UserProfile, goal: TrainingGoal, catalog: ExerciseCatalog, credential: RecognitionCredential) {
  const body = requestBody(profile, goal, catalog);
  let generated: unknown;
  if (credential.provider === 'META') {
    const result = await requestMetaChat(credential.apiKey, {
      temperature: 0.35,
      messages: [
        { role: 'system', content: 'You are a conservative fitness-program assistant. Return strict JSON only.' },
        { role: 'user', content: prompt(body) },
      ],
      response_format: { type: 'json_object' },
    });
    throwMetaRequestError(result.response, result.body, 'personalized training');
    try { generated = JSON.parse(result.body?.choices?.[0]?.message?.content ?? ''); }
    catch { throw new Error('Meta returned an invalid training plan.'); }
  } else {
    const response = await fetch('/api/ai/training/generate', {
      method: 'POST',
      headers: { authorization: `Bearer ${credential.apiKey}`, 'content-type': 'application/json', 'x-recognition-provider': credential.provider },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.error || 'Training plan generation failed.');
    generated = responseBody;
  }
  const plan = validateGeneratedTrainingPlan(generated, catalog.exercises);
  if (plan.goal !== goal) return { ...plan, goal } satisfies GeneratedTrainingPlan;
  return plan;
}

export function defaultTrainingDates(today = new Date()) {
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() + 1);
  return [0, 2, 4, 7, 9, 11].map((offset) => {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + offset);
    const timezoneOffset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
  });
}
