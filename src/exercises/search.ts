import type { Exercise } from './types';

export function exerciseMatches(exercise: Exercise, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [exercise.name, exercise.body_part, exercise.target, exercise.equipment, ...exercise.aliases]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function searchRank(exercise: Exercise, needle: string) {
  const name = exercise.name.toLowerCase();
  const aliases = exercise.aliases.map((alias) => alias.toLowerCase());
  if (name === needle) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
  if (name.includes(needle)) return 2;
  if (aliases.some((alias) => alias.split(/\s+/).some((word) => word.startsWith(needle)))) return 3;
  return 4;
}

export function exerciseSearchSuggestions(exercises: Exercise[], query: string, limit = 5) {
  const needle = query.trim().toLowerCase();
  if (!needle || limit <= 0) return [];

  return exercises
    .filter((exercise) => exerciseMatches(exercise, needle))
    .sort((left, right) => searchRank(left, needle) - searchRank(right, needle) || left.name.localeCompare(right.name))
    .slice(0, limit);
}

