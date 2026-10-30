import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { finalizeWorkoutNumberDraft, parseWorkoutNumberDraft } from '../src/calendar/workoutNumber';

test('workout number drafts accept supported reps and weight values', () => {
  assert.equal(parseWorkoutNumberDraft('12', 'integer'), 12);
  assert.equal(parseWorkoutNumberDraft('12.5', 'decimal'), 12.5);
  assert.equal(parseWorkoutNumberDraft('0', 'integer'), 0);
});

test('workout number drafts remain empty or reject invalid values while editing', () => {
  assert.equal(parseWorkoutNumberDraft('', 'integer'), undefined);
  assert.equal(parseWorkoutNumberDraft('-1', 'decimal'), undefined);
  assert.equal(parseWorkoutNumberDraft('2.5', 'integer'), undefined);
  assert.equal(parseWorkoutNumberDraft('wrong', 'decimal'), undefined);
});

test('workout number drafts normalize empty input and preserve the last valid fallback', () => {
  assert.equal(finalizeWorkoutNumberDraft('', 'integer', 10), 0);
  assert.equal(finalizeWorkoutNumberDraft('-5', 'decimal', 7.5), 7.5);
  assert.equal(finalizeWorkoutNumberDraft('18', 'integer', 10), 18);
});

test('calendar inputs select zero on focus and use draft parsing for reps and weight', () => {
  const source = readFileSync(new URL('../src/calendar/CalendarView.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(value === 0\) event\.currentTarget\.select\(\)/);
  assert.match(source, /WorkoutNumberInput label="Reps"/);
  assert.match(source, /WorkoutNumberInput label="Kg"/);
});
