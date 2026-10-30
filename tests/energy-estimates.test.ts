import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compendiumCalories, estimateDurationSeconds, estimateExerciseEnergy, harvardCalories, schofieldBmrKcalPerMinute, youthCalories } from '../src/energy/estimates';
import { classifyExercise, ENERGY_SOURCE_REGISTRY_VERSION, resolveEnergySource, validateEnergySource } from '../src/energy/sources';
import { applyWorkoutCompletion } from '../src/energy/workout';
import type { ExerciseCatalog } from '../src/exercises/types';

const catalog = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8')) as ExerciseCatalog;
const bench = catalog.exercises.find((exercise) => exercise.id === 'freeexercise:0025')!;

test('age boundaries select no source, Youth bands, Adult MET, and Older Adult MET60+', () => {
  assert.equal(resolveEnergySource(bench, 5), undefined);
  assert.deepEqual([6, 9].map((age) => resolveEnergySource(bench, age)?.ageMin), [6, 6]);
  assert.deepEqual([10, 12].map((age) => resolveEnergySource(bench, age)?.ageMin), [10, 10]);
  assert.deepEqual([13, 15].map((age) => resolveEnergySource(bench, age)?.ageMin), [13, 13]);
  assert.deepEqual([16, 18].map((age) => resolveEnergySource(bench, age)?.ageMin), [16, 16]);
  assert.equal(resolveEnergySource(bench, 19)?.unit, 'MET');
  assert.equal(resolveEnergySource(bench, 59)?.unit, 'MET');
  assert.equal(resolveEnergySource(bench, 60)?.unit, 'MET60+');
});

test('all 317 exercises resolve to versioned and traceable source records for every supported age family', () => {
  assert.equal(catalog.exercises.length, 317);
  for (const exercise of catalog.exercises) {
    assert.ok(classifyExercise(exercise));
    for (const age of [6, 10, 13, 16, 19, 60]) {
      const source = resolveEnergySource(exercise, age);
      assert.ok(source, `${exercise.id} at age ${age}`);
      assert.equal(source.registryVersion, ENERGY_SOURCE_REGISTRY_VERSION);
      assert.match(source.sourceUrl, /^https:\/\//);
      assert.ok(source.activityCode);
      assert.ok(source.activityLabel);
      assert.ok(source.publishedValue > 0);
      assert.ok(source.reuseTerms);
      assert.ok(['exact', 'proxy', 'derived'].includes(source.match));
    }
  }
});

test('Adult, Older Adult, Youth, and Schofield calculations use their published formulas', () => {
  assert.equal(compendiumCalories(5, 80, 30), 210);
  assert.equal(compendiumCalories(5, 80, 30, true), 162);
  const boy = schofieldBmrKcalPerMinute(9, 'male', 30)!;
  const girl = schofieldBmrKcalPerMinute(10, 'female', 40)!;
  assert.ok(Math.abs(boy - ((22.706 * 30 + 504.3) / 1440)) < 1e-12);
  assert.ok(Math.abs(girl - ((13.384 * 40 + 692.6) / 1440)) < 1e-12);
  assert.equal(youthCalories(4, 1, 20), 80);
});

test('duration is derived from entered seconds, four seconds per repetition, and intensity rest', () => {
  assert.equal(estimateDurationSeconds([{ reps: 10 }, { reps: 10 }, { reps: 10 }], 'resistance_general'), 240);
  assert.equal(estimateDurationSeconds([{ reps: 0, durationSeconds: 30 }, { reps: 0, durationSeconds: 45 }], 'squat_deadlift'), 165);
});

test('Harvard values interpolate by body weight and scale from thirty minutes', () => {
  const kg155 = 155 * 0.45359237;
  assert.ok(Math.abs(harvardCalories('general_weight_training', kg155, 30) - 108) < 1e-9);
  assert.ok(Math.abs(harvardCalories('vigorous_weight_training', kg155, 15) - 108) < 1e-9);
  const middle = (125 * 0.45359237 + kg155) / 2;
  assert.ok(Math.abs(harvardCalories('general_weight_training', middle, 30) - 99) < 1e-9);
});

test('AI factor applies after the immutable source calculation and energy equivalent is explicit', () => {
  const sets = [{ reps: 10 }, { reps: 10 }, { reps: 10 }];
  const profile = { age: 35, sex: 'male' as const, weightKg: 80, heightCm: 180, trainingGoal: 'build_muscle' as const };
  const local = estimateExerciseEnergy(bench, sets, profile)!;
  const personalized = estimateExerciseEnergy(bench, sets, profile, 1.2)!;
  assert.equal(personalized.baseCalories, local.baseCalories);
  assert.ok(Math.abs(personalized.calories - local.calories * 1.2) < 1e-9);
  assert.ok(Math.abs(personalized.equivalentKg - personalized.calories / 7700) < 1e-12);
  assert.equal(personalized.confidence, 'AI-personalized estimate');
});

test('source validation rejects incomplete provenance, incompatible ages, and unsupported units', () => {
  const source = resolveEnergySource(bench, 35)!;
  assert.throws(() => validateEnergySource({ ...source, sourceUrl: '' }, 35), /provenance/);
  assert.throws(() => validateEnergySource(source, 12), /incompatible/);
  assert.throws(() => validateEnergySource({ ...source, unit: 'unknown' as 'MET' }, 35), /unit/);
});

test('completed energy is frozen and reopening any set clears it without recalculating history', () => {
  const profile = { age: 35, sex: 'male' as const, weightKg: 80, heightCm: 180, trainingGoal: 'build_muscle' as const };
  const estimate = estimateExerciseEnergy(bench, [{ reps: 10 }, { reps: 10 }], profile)!;
  const planned = { id: 'w1', date: '2026-10-30', exerciseId: bench.id, exerciseName: bench.name, notes: '', completed: false, sets: [{ id: 's1', reps: 10, weightKg: 0, complete: true }, { id: 's2', reps: 10, weightKg: 0, complete: true }] };
  const frozen = applyWorkoutCompletion(planned, estimate);
  assert.equal(frozen.completed, true);
  assert.equal(frozen.caloriesBurned, estimate.calories);
  assert.equal(applyWorkoutCompletion(frozen, { ...estimate, calories: estimate.calories * 1.4 }).caloriesBurned, estimate.calories);
  const reopened = applyWorkoutCompletion({ ...frozen, sets: frozen.sets.map((set, index) => index ? { ...set, complete: false } : set) }, estimate);
  assert.equal(reopened.completed, false);
  assert.equal(reopened.caloriesBurned, undefined);
  assert.equal(reopened.calorieSource, undefined);
});
