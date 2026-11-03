import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { wholeMinuteDurationSeconds } from '../src/energy/estimates';
import { suggestedWorkoutWeightKg, upgradeWorkoutSuggestionDefaults } from '../src/exercises/workoutDefaults';
import type { Exercise } from '../src/exercises/types';
import type { Workout } from '../src/data/db';

test('workout suggestions use profile weight for bodyweight exercises', () => {
  const bodyweight = { equipment: 'body weight' };
  assert.equal(suggestedWorkoutWeightKg(bodyweight, 95, 'manual'), 95);
  assert.equal(suggestedWorkoutWeightKg(bodyweight, 95, 'ai'), 95);
  assert.equal(suggestedWorkoutWeightKg(bodyweight, undefined, 'manual'), 0);
});

test('manual equipment exercises start at ten kilograms while AI loads remain unset', () => {
  const dumbbell = { equipment: 'dumbbell' };
  assert.equal(suggestedWorkoutWeightKg(dumbbell, 95, 'manual'), 10);
  assert.equal(suggestedWorkoutWeightKg(dumbbell, 95, 'ai'), 0);
});

test('new workout suggestions always round activity time up to whole minutes', () => {
  assert.equal(wholeMinuteDurationSeconds(30), 60);
  assert.equal(wholeMinuteDurationSeconds(61), 120);
  assert.equal(wholeMinuteDurationSeconds(120), 120);
});

test('Calendar keeps compact column names and hides estimate provenance rows', () => {
  const calendar = readFileSync(new URL('../src/calendar/CalendarView.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(calendar, /<span>Reps<\/span><span>Weight \(kg\)<\/span><span>Time \(min\)<\/span>/);
  assert.doesNotMatch(styles, /\.set-labels \{ display: none; \}/);
  assert.match(calendar, /min="1"/);
  assert.match(calendar, /step="1"/);
  assert.doesNotMatch(calendar, /Energy equivalent, not guaranteed weight loss/);
  assert.doesNotMatch(calendar, /energySourceLabel\(liveEstimate\)/);
});

test('legacy planned workouts are upgraded without touching completed history', () => {
  const exercise = { id: 'push-up', equipment: 'body weight', name: 'Push-Up', target: 'chest', body_part: 'chest', difficulty: 'beginner' } as Exercise;
  const planned = {
    id: 'planned', exerciseId: exercise.id, exerciseName: exercise.name, date: '2026-11-03', notes: '', completed: false,
    sets: [{ id: 'set', reps: 10, weightKg: 0, durationSeconds: 30, complete: false }],
  } as Workout;
  const upgraded = upgradeWorkoutSuggestionDefaults(planned, exercise, 95);
  assert.equal(upgraded.suggestionDefaultsVersion, 1);
  assert.equal(upgraded.sets[0].weightKg, 95);
  assert.equal(upgraded.sets[0].durationSeconds, 60);

  const completed = { ...planned, completed: true };
  assert.equal(upgradeWorkoutSuggestionDefaults(completed, exercise, 95), completed);
});
