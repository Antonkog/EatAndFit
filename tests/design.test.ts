import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { muscleGroups } from '../src/exercises/ExerciseLibrary';
import type { ExerciseCatalog } from '../src/exercises/types';

const catalog = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8')) as ExerciseCatalog;

test('restored muscle browser matches the original 22 groups and counts', () => {
  const counts = muscleGroups.map((group) => catalog.exercises.filter((exercise) => group.targets.includes(exercise.target.toLowerCase())).length);
  assert.equal(muscleGroups.length, 22);
  assert.deepEqual(counts, [2, 2, 29, 2, 26, 21, 26, 6, 39, 17, 12, 27, 5, 7, 19, 17, 8, 2, 12, 17, 10, 11]);
});
