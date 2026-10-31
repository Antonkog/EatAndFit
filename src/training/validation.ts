import type { Exercise } from '../exercises/types';
import type { CalibrationCorrection, GeneratedTrainingPlan } from './types';

export function validateGeneratedTrainingPlan(value: unknown, exercises: Exercise[]): GeneratedTrainingPlan {
  const plan = value as GeneratedTrainingPlan;
  const validIds = new Set(exercises.map((exercise) => exercise.id));
  if (!plan || !['lose_weight', 'build_muscle', 'stay_fit'].includes(plan.goal) || !Array.isArray(plan.sessions) || plan.sessions.length !== 6) {
    throw new Error('The AI provider returned an invalid two-week plan.');
  }
  for (const session of plan.sessions) {
    if (!session || typeof session.title !== 'string' || !session.title.trim() || !Array.isArray(session.exercises) || session.exercises.length < 5 || session.exercises.length > 7) {
      throw new Error('Each training session must contain 5–7 catalog exercises.');
    }
    for (const exercise of session.exercises) {
      const hasReps = Number.isInteger(exercise.reps) && Number(exercise.reps) >= 1 && Number(exercise.reps) <= 100;
      const hasDuration = Number.isInteger(exercise.durationMinutes) && Number(exercise.durationMinutes) >= 1 && Number(exercise.durationMinutes) <= 60;
      if (!validIds.has(exercise.exerciseId) || !Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 8 || (!hasReps && !hasDuration)) {
        throw new Error('The AI provider returned an exercise that is not valid for this catalog.');
      }
    }
  }
  return plan;
}

export function calibrationFactor(
  baselines: Array<{ exerciseId: string; calories: number }>,
  corrections: CalibrationCorrection[],
) {
  if (baselines.length !== 5 || corrections.length !== 5) throw new Error('AI calibration must return five exercise values.');
  const byId = new Map(corrections.map((item) => [item.exerciseId, item.calories]));
  const ratios = baselines.map((baseline) => {
    const corrected = byId.get(baseline.exerciseId);
    if (!Number.isFinite(corrected) || Number(corrected) < baseline.calories * 0.5 || Number(corrected) > baseline.calories * 1.5) {
      throw new Error('An AI calorie correction was outside the accepted 50–150% range.');
    }
    return Number(corrected) / baseline.calories;
  });
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}
