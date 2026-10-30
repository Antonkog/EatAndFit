import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { ExerciseCatalog } from '../src/exercises/types';
import { defaultTrainingDates } from '../src/training/generation';
import { calibrationFactor, validateGeneratedTrainingPlan } from '../src/training/validation';

const catalog = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8')) as ExerciseCatalog;
const ids = catalog.exercises.slice(0, 7).map((exercise) => exercise.id);

function validPlan() {
  return {
    goal: 'stay_fit' as const,
    sessions: Array.from({ length: 6 }, (_, index) => ({
      title: `Session ${index + 1}`,
      exercises: ids.slice(0, 5).map((exerciseId) => ({ exerciseId, sets: 3, reps: 10 })),
    })),
  };
}

test('default plan dates are Monday, Wednesday, and Friday across two weeks', () => {
  assert.deepEqual(defaultTrainingDates(new Date(2026, 10, 4, 12)), ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20']);
});

test('training validation requires six sessions, 5–7 exercises, and catalog IDs', () => {
  assert.equal(validateGeneratedTrainingPlan(validPlan(), catalog.exercises).sessions.length, 6);
  const missing = validPlan();
  missing.sessions[0].exercises[0].exerciseId = 'not-in-catalog';
  assert.throws(() => validateGeneratedTrainingPlan(missing, catalog.exercises), /catalog/);
  const short = validPlan();
  short.sessions[0].exercises.length = 4;
  assert.throws(() => validateGeneratedTrainingPlan(short, catalog.exercises), /5–7/);
});

test('five-exercise AI calibration accepts only corrections within 50–150 percent', () => {
  const baselines = Array.from({ length: 5 }, (_, index) => ({ exerciseId: `e${index}`, calories: 100 }));
  assert.equal(calibrationFactor(baselines, baselines.map(({ exerciseId }) => ({ exerciseId, calories: 120 }))), 1.2);
  assert.throws(() => calibrationFactor(baselines, baselines.map(({ exerciseId }, index) => ({ exerciseId, calories: index ? 100 : 151 }))), /50–150%/);
  assert.throws(() => calibrationFactor(baselines, baselines.slice(0, 4)), /five/);
});

test('calendar bulk actions and training plan saves use readwrite IndexedDB transactions', () => {
  const source = readFileSync(new URL('../src/data/db.ts', import.meta.url), 'utf8');
  assert.match(source, /saveTrainingPlan[\s\S]*transaction\('workouts', 'readwrite'\)/);
  assert.match(source, /removePlannedWorkoutsForDate[\s\S]*transaction\('workouts', 'readwrite'\)/);
  assert.match(source, /moveFutureWorkoutsOneDay[\s\S]*transaction\('workouts', 'readwrite'\)/);
  const calendar = readFileSync(new URL('../src/calendar/CalendarView.tsx', import.meta.url), 'utf8');
  assert.match(calendar, /Remove planned trainings for this day/);
  assert.match(calendar, /Move all future trainings by 1 day/);
});
