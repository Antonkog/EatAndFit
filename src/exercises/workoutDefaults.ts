import type { Workout } from '../data/db';
import { estimateSetDurationSeconds, wholeMinuteDurationSeconds } from '../energy/estimates';
import { classifyExercise } from '../energy/sources';
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

export function upgradeWorkoutSuggestionDefaults(
  workout: Workout,
  exercise: Exercise,
  profileWeightKg: number | undefined,
) {
  if (workout.completed || workout.suggestionDefaultsVersion === 1) return workout;
  const suggestedWeight = suggestedWorkoutWeightKg(exercise, profileWeightKg, workout.trainingPlanId ? 'ai' : 'manual');
  const energyProfile = classifyExercise(exercise);
  return {
    ...workout,
    suggestionDefaultsVersion: 1 as const,
    sets: workout.sets.map((set) => set.complete ? set : {
      ...set,
      weightKg: set.weightKg === 0 ? suggestedWeight : set.weightKg,
      durationSeconds: wholeMinuteDurationSeconds(set.durationSeconds ?? estimateSetDurationSeconds(set.reps, energyProfile)),
    }),
  };
}
