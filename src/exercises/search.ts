import type { Exercise } from './types';

export function exerciseMatches(exercise: Exercise, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [exercise.name, exercise.body_part, exercise.target, exercise.equipment, ...exercise.aliases]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

