import type { Workout } from '../data/db';
import type { StoredMetaMovementAnalysis } from './types';

export function applyAcceptedMovementCount(
  workout: Workout,
  setId: string | undefined,
  acceptedRepCount: number,
  metaAnalysis: StoredMetaMovementAnalysis,
): Workout {
  if (!setId || !Number.isInteger(acceptedRepCount) || acceptedRepCount < 0) return workout;
  const selectedSet = workout.sets.find((set) => set.id === setId);
  if (!selectedSet?.movementSummary) return workout;

  const countChanged = selectedSet.reps !== acceptedRepCount || selectedSet.completedReps !== acceptedRepCount;
  const reconciled = {
    ...workout,
    sets: workout.sets.map((set) => set.id === setId
      ? {
          ...set,
          reps: acceptedRepCount,
          completedReps: acceptedRepCount,
          movementSummary: {
            ...set.movementSummary!,
            completedReps: acceptedRepCount,
            metaAnalysis,
          },
        }
      : set),
  };

  if (!countChanged) return reconciled;
  const {
    caloriesBurned: _caloriesBurned,
    calorieSource: _calorieSource,
    calorieSourceUrl: _calorieSourceUrl,
    energyDurationMinutes: _energyDurationMinutes,
    energyEquivalentKg: _energyEquivalentKg,
    ...withoutFrozenEnergy
  } = reconciled;
  return { ...withoutFrozenEnergy, completed: false };
}
