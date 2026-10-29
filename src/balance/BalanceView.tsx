import { Dumbbell, Flame, Utensils } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { allFood, allWorkouts, localDate, type FoodEntry, type Workout } from '../data/db';
import { balanceBand, dailyBalance, gaugePosition, rollingBalances, type DailyBalance } from './calculations';

const gaugeColors = { red: '#ff6b5f', yellow: '#ffd35f', green: '#b7ff4f' };

function point(angle: number, radius: number) {
  const radians = angle * Math.PI / 180;
  return { x: 160 + Math.cos(radians) * radius, y: 150 + Math.sin(radians) * radius };
}

function arc(start: number, end: number) {
  const from = point(start, 110);
  const to = point(end, 110);
  return `M ${from.x} ${from.y} A 110 110 0 0 1 ${to.x} ${to.y}`;
}

function signed(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`;
}

function dayLabel(date: string, today: string) {
  if (date === today) return 'Today';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
}

function BalanceGauge({ value }: { value: number }) {
  const position = gaugePosition(value);
  const needle = point(position.angle, 82);
  return (
    <div className="balance-gauge" aria-label={`Calorie balance ${signed(value)} kilocalories`}>
      <div className="gauge-value"><strong style={{ color: gaugeColors[position.band] }}>{signed(value)}</strong><span>kcal</span></div>
      <svg viewBox="0 0 320 190" role="img">
        <path className="gauge-track" d={arc(180, 360)} />
        <path className="gauge-red" d={arc(180, 261)} />
        <path className="gauge-yellow" d={arc(261, 279)} />
        <path className="gauge-green" d={arc(279, 360)} />
        <line className="gauge-needle" x1="160" y1="150" x2={needle.x} y2={needle.y} />
        <circle className="gauge-pin" cx="160" cy="150" r="9" />
      </svg>
      <div className="gauge-labels"><span>+5,000</span><span>0</span><span>−5,000</span></div>
    </div>
  );
}

function SevenDayChart({ days, today }: { days: DailyBalance[]; today: string }) {
  const maximum = Math.max(1, ...days.map((day) => Math.abs(day.balance)));
  return (
    <section className="balance-chart-card">
      <header><h2>Daily balance</h2><small>Eaten − burned</small></header>
      <div className="balance-chart" role="img" aria-label="Calorie balance for today and the previous six days">
        {days.map((day) => {
          const height = day.balance === 0 ? 0 : Math.max(5, Math.abs(day.balance) / maximum * 45);
          const band = balanceBand(day.balance);
          return (
            <div className={day.date === today ? 'today' : ''} key={day.date}>
              <span className="chart-value">{signed(day.balance)}</span>
              <span className="chart-track">
                <i className={band} style={{ height: `${height}%`, top: day.balance >= 0 ? `${50 - height}%` : '50%' }} />
              </span>
              <strong>{dayLabel(day.date, today)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BalanceView({ onAddFood, onAddExercise }: { onAddFood: () => void; onAddExercise: () => void }) {
  const today = localDate();
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const refresh = useCallback(() => {
    void Promise.all([allFood(), allWorkouts()]).then(([nextFood, nextWorkouts]) => {
      setFood(nextFood);
      setWorkouts(nextWorkouts);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('eatfit-data-change', refresh);
    return () => window.removeEventListener('eatfit-data-change', refresh);
  }, [refresh]);

  const totals = useMemo(() => dailyBalance(today, food, workouts), [food, today, workouts]);
  const week = useMemo(() => rollingBalances(today, food, workouts), [food, today, workouts]);

  return (
    <section className="balance-view">
      <header className="balance-heading">
        <div><h1>Balance for today</h1><p>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${today}T12:00:00`))}</p></div>
      </header>
      <div className="balance-grid">
        <article className="balance-gauge-card">
          <div className="balance-card-title"><span><Flame size={18} /></span><strong>Calorie balance</strong></div>
          <BalanceGauge value={totals.balance} />
          <p>Food moves the needle left. Calories from completed exercise move it right.</p>
        </article>
        <div className="balance-side">
          <section className="balance-totals">
            <article><span className="eaten"><Utensils size={18} /></span><small>Eaten</small><strong>+{Math.round(totals.eaten).toLocaleString('en-US')} kcal</strong></article>
            <article><span className="burned"><Flame size={18} /></span><small>Burned</small><strong>−{Math.round(totals.burned).toLocaleString('en-US')} kcal</strong></article>
            <article><span className={`net ${balanceBand(totals.balance)}`}><Flame size={18} /></span><small>Balance</small><strong>{signed(totals.balance)} kcal</strong></article>
          </section>
          <section className="balance-actions">
            <div><p className="eyebrow">Log today</p><h2>Update your balance</h2><p>Add a meal or choose an exercise for today.</p></div>
            <button className="primary-button large" onClick={onAddFood}><Utensils size={18} /> Add food</button>
            <button className="text-button large" onClick={onAddExercise}><Dumbbell size={18} /> Add exercise</button>
          </section>
        </div>
      </div>
      <SevenDayChart days={week} today={today} />
    </section>
  );
}
