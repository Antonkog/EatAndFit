import type { FoodEntry, Workout } from '../data/db';

export const BALANCE_MIN = -3500;
export const BALANCE_MAX = 3500;

export type DailyBalance = {
  date: string;
  eaten: number;
  burned: number;
  balance: number;
};

function safeCalories(value?: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateKey(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

export function dailyBalance(date: string, food: FoodEntry[], workouts: Workout[]): DailyBalance {
  const eaten = food.filter((item) => item.date === date).reduce((total, item) => total + safeCalories(item.calories), 0);
  const burned = workouts
    .filter((item) => item.date === date && item.completed)
    .reduce((total, item) => total + safeCalories(item.caloriesBurned), 0);
  return { date, eaten, burned, balance: eaten - burned };
}

export function rollingDateKeys(today: string, count = 7) {
  const current = parseLocalDate(today);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current);
    date.setDate(current.getDate() - (count - index - 1));
    return dateKey(date);
  });
}

export function rollingBalances(today: string, food: FoodEntry[], workouts: Workout[]) {
  return rollingDateKeys(today).map((date) => dailyBalance(date, food, workouts));
}

export function balanceBand(balance: number): 'red' | 'yellow' | 'green' {
  if (balance > 500) return 'red';
  if (balance < -500) return 'green';
  return 'yellow';
}

export function gaugePosition(balance: number) {
  const clamped = Math.min(BALANCE_MAX, Math.max(BALANCE_MIN, balance));
  const ratio = (BALANCE_MAX - clamped) / (BALANCE_MAX - BALANCE_MIN);
  return { clamped, ratio, angle: 180 + ratio * 180, band: balanceBand(balance) };
}
