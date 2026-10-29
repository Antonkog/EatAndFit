import assert from 'node:assert/strict';
import test from 'node:test';
import { exerciseMatches } from '../src/exercises/search';
import type { Exercise } from '../src/exercises/types';

const exercise = { name: 'Goblet Squat', body_part: 'upper legs', target: 'quads', equipment: 'dumbbell', aliases: ['cup squat'] } as Exercise;
test('exercise search covers name, target, equipment and aliases', () => {
  assert.equal(exerciseMatches(exercise, 'quads'), true);
  assert.equal(exerciseMatches(exercise, 'cup'), true);
  assert.equal(exerciseMatches(exercise, 'barbell'), false);
});
