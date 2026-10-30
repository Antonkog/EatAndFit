import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { balanceBand, dailyBalance, gaugePosition, rollingBalances, rollingDateKeys } from '../src/balance/calculations';
import type { FoodEntry, Workout } from '../src/data/db';

function food(date: string, calories?: number): FoodEntry {
  return { id: crypto.randomUUID(), date, title: 'Meal', provider: 'test', calories };
}

function workout(date: string, completed: boolean, caloriesBurned?: number): Workout {
  return { id: crypto.randomUUID(), date, exerciseId: 'exercise', exerciseName: 'Exercise', sets: [], notes: '', completed, caloriesBurned, calorieSource: caloriesBurned ? 'test' : undefined };
}

test('daily balance starts at zero and subtracts completed exercise calories from food', () => {
  assert.deepEqual(dailyBalance('2026-10-29', [], []), { date: '2026-10-29', eaten: 0, burned: 0, balance: 0 });
  const result = dailyBalance(
    '2026-10-29',
    [food('2026-10-29', 450), food('2026-10-28', 900), food('2026-10-29', Number.NaN)],
    [workout('2026-10-29', true, 600), workout('2026-10-29', false, 1000), workout('2026-10-29', true)],
  );
  assert.deepEqual(result, { date: '2026-10-29', eaten: 450, burned: 600, balance: -150 });
});

test('gauge bands include the yellow boundary and clamp only the needle', () => {
  assert.equal(balanceBand(-501), 'green');
  assert.equal(balanceBand(-500), 'yellow');
  assert.equal(balanceBand(500), 'yellow');
  assert.equal(balanceBand(501), 'red');
  assert.deepEqual(gaugePosition(-6000), { clamped: -3500, ratio: 1, angle: 360, band: 'green' });
  assert.deepEqual(gaugePosition(0), { clamped: 0, ratio: 0.5, angle: 270, band: 'yellow' });
  assert.deepEqual(gaugePosition(6000), { clamped: 3500, ratio: 0, angle: 180, band: 'red' });
});

test('gauge uses a continuous red-yellow-green gradient with the new labels', () => {
  const source = readFileSync(new URL('../src/balance/BalanceView.tsx', import.meta.url), 'utf8');
  assert.match(source, /linearGradient id="balance-gauge-gradient"/);
  assert.match(source, /offset="0%" stopColor="#ff6b5f"/);
  assert.match(source, /offset="50%" stopColor="#ffd35f"/);
  assert.match(source, /offset="100%" stopColor="#b7ff4f"/);
  assert.match(source, /\+3,500[\s\S]*−3,500/);
  assert.doesNotMatch(source, /gauge-red|gauge-yellow|gauge-green/);
});

test('rolling balance covers today and the previous six local dates', () => {
  assert.deepEqual(rollingDateKeys('2026-03-02'), ['2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  const days = rollingBalances('2026-03-02', [food('2026-02-24', 200), food('2026-03-02', 300)], [workout('2026-03-02', true, 500)]);
  assert.equal(days[0].balance, 200);
  assert.equal(days[6].balance, -200);
});

test('Balance is the default middle navigation destination', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /useState<View>\('balance'\)/);
  assert.match(source, /calendar[\s\S]*label: 'Balance'[\s\S]*label: 'Recipes'/);
  assert.match(source, /onClick=\{\(\) => showView\('balance'\)\} aria-label="Eat and Fit home"/);
  assert.match(source, /showRecipes\(\[\], localDate\(\), 'balance'\)/);
  assert.match(source, /foodReturnView === 'balance'[\s\S]*setView\('balance'\)/);
  assert.match(source, /onAddExercise=\{\(\) => showView\('exercises'\)\}/);
  assert.doesNotMatch(source, /kg energy equivalent/);
});
