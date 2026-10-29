import {
  Barcode,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Dumbbell,
  Plus,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  allFood,
  allWorkouts,
  foodForDate,
  localDate,
  removeFood,
  removeWorkout,
  saveFood,
  saveWorkout,
  workoutsForDate,
  type FoodEntry,
  type MealType,
  type Workout,
} from '../data/db';
import type { ExerciseCatalog } from '../exercises/types';

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function parseLocal(value: string) { return new Date(`${value}T12:00:00`); }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function fullDate(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(parseLocal(value)); }
function monthLabel(value: Date) { return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(value); }

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const visibleDayCount = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  return Array.from({ length: visibleDayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function CalendarView({
  initialDate,
  initialMode = 'workout',
  onBrowse,
  onRecipes,
  onProduct,
}: {
  initialDate: string;
  initialMode?: 'workout' | 'food';
  onBrowse: () => void;
  onRecipes: (date: string) => void;
  onProduct: (date: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [month, setMonth] = useState(() => parseLocal(initialDate));
  const [mode, setMode] = useState<'workout' | 'food'>(initialMode);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [activityDates, setActivityDates] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<ExerciseCatalog>();

  const refresh = useCallback(() => {
    void Promise.all([workoutsForDate(date), foodForDate(date), allWorkouts(), allFood()]).then(([nextWorkouts, nextFood, everyWorkout, everyFood]) => {
      setWorkouts(nextWorkouts);
      setFood(nextFood);
      setActivityDates(new Set([...everyWorkout, ...everyFood].map((item) => item.date)));
    });
  }, [date]);

  useEffect(() => {
    refresh();
    window.addEventListener('eatfit-data-change', refresh);
    return () => window.removeEventListener('eatfit-data-change', refresh);
  }, [refresh]);

  useEffect(() => { void fetch('/data/catalog.json').then((response) => response.json()).then(setCatalog); }, []);

  const exerciseMap = useMemo(() => new Map(catalog?.exercises.map((exercise) => [exercise.id, exercise]) ?? []), [catalog]);
  const days = useMemo(() => calendarDays(month), [month]);

  const selectDate = (selected: Date) => {
    const value = localDate(selected);
    setDate(value);
    setMonth(selected);
  };

  const updateWorkout = (workout: Workout) => {
    setWorkouts((items) => items.map((item) => item.id === workout.id ? workout : item));
    void saveWorkout(workout);
  };

  return (
    <div className="calendar-layout">
      <aside className="calendar-sidebar">
        <h1>Calendar</h1>
        <p>Select a day to inspect or edit workouts and nutrition.</p>
        <div className="month-picker">
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}><ChevronLeft size={17} /></button>
          <strong>{monthLabel(month)}</strong>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}><ChevronRight size={17} /></button>
        </div>
        <div className="calendar-grid" role="grid">
          {weekdays.map((item) => <span className="weekday" key={item}>{item}</span>)}
          {days.map((item) => {
            const value = localDate(item);
            const outside = item.getMonth() !== month.getMonth();
            return (
              <button
                key={value}
                className={`${value === date ? 'selected' : ''} ${outside ? 'outside' : ''}`}
                onClick={() => selectDate(item)}
                aria-label={fullDate(value)}
              >
                {item.getDate()}
                {activityDates.has(value) && <i />}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="calendar-content">
        <div className="calendar-tabs" role="tablist" aria-label="Calendar">
          <button role="tab" aria-selected={mode === 'workout'} className={mode === 'workout' ? 'active' : ''} onClick={() => setMode('workout')}><Dumbbell size={17} /> Workout</button>
          <button role="tab" aria-selected={mode === 'food'} className={mode === 'food' ? 'active' : ''} onClick={() => setMode('food')}><Utensils size={17} /> Nutrition</button>
        </div>
        {mode === 'workout' ? (
          <WorkoutDay
            date={date}
            workouts={workouts}
            exerciseMap={exerciseMap}
            onBrowse={onBrowse}
            onChange={updateWorkout}
          />
        ) : (
          <FoodDay date={date} entries={food} onRecipes={() => onRecipes(date)} onProduct={() => onProduct(date)} />
        )}
      </section>
    </div>
  );
}

function DayHeading({ date, actions }: { date: string; actions: React.ReactNode }) {
  return (
    <div className="day-heading">
      <div><span>Stored in this browser</span><h2>{fullDate(date)}</h2></div>
      <div className="day-actions">{actions}</div>
    </div>
  );
}

function WorkoutDay({
  date,
  workouts,
  exerciseMap,
  onBrowse,
  onChange,
}: {
  date: string;
  workouts: Workout[];
  exerciseMap: Map<string, ExerciseCatalog['exercises'][number]>;
  onBrowse: () => void;
  onChange: (workout: Workout) => void;
}) {
  return (
    <section>
      <DayHeading date={date} actions={<button className="primary-button" onClick={onBrowse}><Plus size={17} /> Add to workout</button>} />
      {workouts.length === 0 ? (
        <div className="empty-card calendar-empty">
          <span><Dumbbell /></span>
          <h3>Nothing planned for this day.</h3>
          <button className="text-button" onClick={onBrowse}><Plus size={17} /> Add to workout</button>
        </div>
      ) : (
        <div className="workout-list">
          {workouts.map((workout) => {
            const exercise = exerciseMap.get(workout.exerciseId);
            const thumbnail = exercise?.media.thumbnail?.female ?? exercise?.media.thumbnail?.male;
            return (
              <article className="workout-card" key={workout.id}>
                <header>
                  {thumbnail ? <img src={thumbnail} alt="" /> : <span className="workout-placeholder"><Dumbbell /></span>}
                  <div className="workout-title">
                    <div><span className={`badge ${workout.completed ? 'solid' : 'outline'}`}>{workout.completed ? 'Completed' : 'Planned'}</span><small>{workout.sets.length} sets</small></div>
                    <h3>{workout.exerciseName}</h3>
                  </div>
                  <button className="icon-button" onClick={() => void removeWorkout(workout.id)} aria-label="Remove exercise"><Trash2 size={18} /></button>
                </header>
                <div className="set-list">
                  <div className="set-labels"><span>Set</span><span>Reps</span><span>Kg</span><span>Seconds</span><span>Done</span></div>
                  {workout.sets.map((set, index) => (
                    <div className={set.complete ? 'set-row complete' : 'set-row'} key={set.id}>
                      <strong>{index + 1}</strong>
                      <input aria-label="Reps" type="number" min="0" placeholder="Reps" value={set.reps} onChange={(event) => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, reps: Number(event.target.value) } : item) })} />
                      <input aria-label="Kg" type="number" min="0" step="0.5" placeholder="Kg" value={set.weightKg} onChange={(event) => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, weightKg: Number(event.target.value) } : item) })} />
                      <input aria-label="Seconds" type="number" min="0" placeholder="Sec" value={set.durationSeconds ?? ''} onChange={(event) => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, durationSeconds: event.target.value ? Number(event.target.value) : undefined } : item) })} />
                      <button className={set.complete ? 'set-done active' : 'set-done'} aria-label="Done" onClick={() => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, complete: !item.complete } : item) })}>{set.complete ? <Check size={17} /> : <Circle size={17} />}</button>
                    </div>
                  ))}
                  <button className="add-set" onClick={() => onChange({ ...workout, sets: [...workout.sets, { id: crypto.randomUUID(), reps: 10, weightKg: 0, complete: false }] })}><Plus size={17} /> Add set</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FoodDay({ date, entries, onRecipes, onProduct }: { date: string; entries: FoodEntry[]; onRecipes: () => void; onProduct: () => void }) {
  const totals = entries.reduce((sum, item) => ({
    calories: sum.calories + (item.calories ?? 0),
    protein: sum.protein + (item.protein ?? 0),
    carbs: sum.carbs + (item.carbs ?? 0),
    fat: sum.fat + (item.fat ?? 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return (
    <section>
      <DayHeading date={date} actions={<><button className="primary-button" onClick={onRecipes}><Utensils size={17} /> Add food</button><button className="text-button" onClick={onProduct}><Barcode size={17} /> Add product</button></>} />
      {entries.length === 0 ? (
        <div className="empty-card calendar-empty">
          <span><Utensils /></span><h3>No food has been added for this day.</h3>
          <div className="day-actions"><button className="text-button" onClick={onRecipes}><Plus size={17} /> Add food</button><button className="text-button" onClick={onProduct}><Barcode size={17} /> Add product</button></div>
        </div>
      ) : (
        <>
          <section className="daily-total"><h3>Daily total</h3><MacroGrid values={totals} /></section>
          <div className="food-log-list">
            {entries.map((entry) => <FoodRow key={entry.id} entry={entry} />)}
          </div>
          <p className="data-attribution">Nutrition estimates may come from DataHive, USDA FoodData Central, AI generation, or Open Food Facts.</p>
        </>
      )}
    </section>
  );
}

function FoodRow({ entry }: { entry: FoodEntry }) {
  const [date, setDate] = useState(entry.date);
  const [meal, setMeal] = useState<MealType>(entry.mealType ?? 'dinner');
  const [quantity, setQuantity] = useState(entry.quantity ?? 1);
  return (
    <article className="food-log-card">
      <div className="food-log-summary">
        {entry.imageUrl ? <img src={entry.imageUrl} alt="" /> : <span><Utensils /></span>}
        <div><small>{titleCase(entry.mealType ?? 'dinner')}</small><h3>{entry.title}</h3><p>{Math.round(entry.calories ?? 0)} kcal · Protein {(entry.protein ?? 0).toFixed(1)}g · Fat {(entry.fat ?? 0).toFixed(1)}g</p></div>
      </div>
      <div className="food-log-controls">
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label>
        <label>Servings<input type="number" min="0.25" step="0.25" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        <button className="text-button" onClick={() => void saveFood({ ...entry, date, mealType: meal, quantity })}>Update</button>
        <button className="danger-icon" aria-label="Remove food" onClick={() => void removeFood(entry.id)}><Trash2 size={17} /></button>
      </div>
    </article>
  );
}

function MacroGrid({ values }: { values: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-grid"><div><small>Calories</small><strong>{Math.round(values.calories)} kcal</strong></div><div><small>Protein</small><strong>{values.protein.toFixed(1)} g</strong></div><div><small>Carbs</small><strong>{values.carbs.toFixed(1)} g</strong></div><div><small>Fat</small><strong>{values.fat.toFixed(1)} g</strong></div></div>;
}
