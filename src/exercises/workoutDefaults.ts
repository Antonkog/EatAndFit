import type { Exercise } from './types';

export type WorkoutSuggestionSource = 'manual' | 'ai';

export function isBodyweightExercise(exercise: Pick<Exercise, 'equipment'>) {
  const equipment = exercise.equipment.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return equipment === 'body weight' || equipment === 'bodyweight';
}

export function suggestedWorkoutWeightKg(
  exercise: Pick<Exercise, 'equipment'>,
  profileWeightKg: number | undefined,
  source: WorkoutSuggestionSource,
) {
  if (isBodyweightExercise(exercise)) {
    return Number.isFinite(profileWeightKg) && Number(profileWeightKg) > 0 ? Number(profileWeightKg) : 0;
  }
  return source === 'manual' ? 10 : 0;
}
