import type { Workout } from '../data/db';
import { energySourceLabel, type EnergyEstimate } from './estimates';

export function applyWorkoutCompletion(workout: Workout, estimate?: EnergyEstimate): Workout {
  const complete = workout.sets.length > 0 && workout.sets.every((set) => set.complete);
  if (!complete) {
    const {
      caloriesBurned: _caloriesBurned,
      calorieSource: _calorieSource,
      calorieSourceUrl: _sourceUrl,
      energyDurationMinutes: _duration,
      energyEquivalentKg: _equivalent,
      ...planned
    } = workout;
    return { ...planned, completed: false };
  }
  if (workout.completed && workout.caloriesBurned !== undefined) return workout;
  return {
    ...workout,
    completed: true,
    ...(estimate ? {
      caloriesBurned: estimate.calories,
      calorieSource: energySourceLabel(estimate),
      calorieSourceUrl: estimate.source.sourceUrl,
      energyDurationMinutes: estimate.durationMinutes,
      energyEquivalentKg: estimate.equivalentKg,
    } : {}),
  };
}
