import assert from 'node:assert/strict';
import test from 'node:test';
import { exerciseMatches, exerciseSearchSuggestions } from '../src/exercises/search';
import type { Exercise } from '../src/exercises/types';

const exercise = { name: 'Goblet Squat', body_part: 'upper legs', target: 'quads', equipment: 'dumbbell', aliases: ['cup squat'] } as Exercise;
test('exercise search covers name, target, equipment and aliases', () => {
  assert.equal(exerciseMatches(exercise, 'quads'), true);
  assert.equal(exerciseMatches(exercise, 'cup'), true);
  assert.equal(exerciseMatches(exercise, 'barbell'), false);
});

test('catalog exercise suggestions return at most five relevant choices', () => {
  const exercises = [
    { name: 'Shoulder Press', body_part: 'shoulders', target: 'delts', equipment: 'dumbbell', aliases: [] },
    { name: 'Barbell Bench Press', body_part: 'chest', target: 'pectorals', equipment: 'barbell', aliases: [] },
    { name: 'Leg Press', body_part: 'upper legs', target: 'quadriceps', equipment: 'machine', aliases: [] },
    { name: 'Chest Press', body_part: 'chest', target: 'pectorals', equipment: 'machine', aliases: [] },
    { name: 'Arnold Press', body_part: 'shoulders', target: 'delts', equipment: 'dumbbell', aliases: [] },
    { name: 'Military Press', body_part: 'shoulders', target: 'delts', equipment: 'barbell', aliases: [] },
    { name: 'Goblet Squat', body_part: 'upper legs', target: 'quads', equipment: 'dumbbell', aliases: [] },
  ] as Exercise[];

  const suggestions = exerciseSearchSuggestions(exercises, 'Press');
  assert.equal(suggestions.length, 5);
  assert.ok(suggestions.some((item) => item.name === 'Barbell Bench Press'));
  assert.ok(suggestions.every((item) => item.name.toLowerCase().includes('press')));
  assert.deepEqual(exerciseSearchSuggestions(exercises, '  '), []);
});
