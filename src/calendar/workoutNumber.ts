export type WorkoutNumberKind = 'integer' | 'decimal';

export function parseWorkoutNumberDraft(value: string, kind: WorkoutNumberKind) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  if (kind === 'integer' && !Number.isInteger(number)) return undefined;
  return number;
}

export function finalizeWorkoutNumberDraft(value: string, kind: WorkoutNumberKind, fallback: number) {
  if (!value.trim()) return 0;
  return parseWorkoutNumberDraft(value, kind) ?? fallback;
}
