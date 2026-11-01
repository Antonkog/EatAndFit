export type CameraSetTarget = {
  targetReps: number;
  targetSeconds: number;
};

export function resolveCameraSetTarget(set: { reps?: number; durationSeconds?: number } | undefined): CameraSetTarget {
  const targetReps = Number.isFinite(set?.reps) && Number(set?.reps) > 0 ? Math.floor(Number(set?.reps)) : 0;
  const enteredDuration = Number.isFinite(set?.durationSeconds) && Number(set?.durationSeconds) > 0
    ? Number(set?.durationSeconds)
    : 0;
  return {
    targetReps,
    targetSeconds: Math.max(5, enteredDuration || (targetReps > 0 ? targetReps * 4 : 30)),
  };
}

export function cameraSetIsComplete(target: CameraSetTarget, completedReps: number, elapsedSeconds: number) {
  return target.targetReps > 0
    ? completedReps >= target.targetReps
    : elapsedSeconds >= target.targetSeconds;
}

export function cameraSetProgress(target: CameraSetTarget, completedReps: number, elapsedSeconds: number) {
  const value = target.targetReps > 0
    ? completedReps / target.targetReps
    : elapsedSeconds / target.targetSeconds;
  return Math.min(100, Math.max(0, value * 100));
}
