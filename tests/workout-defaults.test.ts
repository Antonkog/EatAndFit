import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { wholeMinuteDurationSeconds } from '../src/energy/estimates';
import { suggestedWorkoutWeightKg } from '../src/exercises/workoutDefaults';

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
