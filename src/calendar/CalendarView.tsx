import {
  Barcode,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Dumbbell,
  Plus,
  RotateCw,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  allFood,
  allWorkouts,
  foodForDate,
  localDate,
  moveFutureWorkoutsOneDay,
  removeFood,
  removePlannedWorkoutsForDate,
  removeWorkout,
  saveFood,
  saveWorkout,
  workoutsForDate,
  type FoodEntry,
  type MealType,
  type Workout,
} from '../data/db';
import { energySourceLabel, estimateExerciseEnergy, estimateSetDurationSeconds, type EnergyEstimate } from '../energy/estimates';
import { classifyExercise, type EnergyProfileId } from '../energy/sources';
import { applyWorkoutCompletion } from '../energy/workout';
import type { ExerciseCatalog } from '../exercises/types';
import { PROFILE_CHANGED, readUserProfile, type UserProfile } from '../profile/userProfile';
import { getRecognitionKeyStatus, RECOGNITION_KEYS_CHANGED } from '../settings/secureKeys';
import { ENERGY_CALIBRATION_CHANGED, readEnergyCalibration } from '../training/calibration';
import { finalizeWorkoutNumberDraft, parseWorkoutNumberDraft, type WorkoutNumberKind } from './workoutNumber';
import { CalendarFoodDetail } from './CalendarEntryDetail';
import { ExerciseDetail } from '../exercises/ExerciseLibrary';
import type { Exercise } from '../exercises/types';

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
  const [profile, setProfile] = useState<UserProfile>(readUserProfile);
  const [calibration, setCalibration] = useState<number>();
  const [selectedExercise, setSelectedExercise] = useState<Exercise>();
  const [selectedFood, setSelectedFood] = useState<FoodEntry>();

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

  useEffect(() => {
    const refreshEnergyProfile = () => {
      const nextProfile = readUserProfile();
      setProfile(nextProfile);
      if (!__SMART_SCANNER__) { setCalibration(undefined); return; }
      void getRecognitionKeyStatus().then((status) => setCalibration(readEnergyCalibration(nextProfile, status.activeProvider))).catch(() => setCalibration(undefined));
    };
    refreshEnergyProfile();
    window.addEventListener(PROFILE_CHANGED, refreshEnergyProfile);
    window.addEventListener(RECOGNITION_KEYS_CHANGED, refreshEnergyProfile);
    window.addEventListener(ENERGY_CALIBRATION_CHANGED, refreshEnergyProfile);
    return () => {
      window.removeEventListener(PROFILE_CHANGED, refreshEnergyProfile);
      window.removeEventListener(RECOGNITION_KEYS_CHANGED, refreshEnergyProfile);
      window.removeEventListener(ENERGY_CALIBRATION_CHANGED, refreshEnergyProfile);
    };
  }, []);

  const exerciseMap = useMemo(() => new Map(catalog?.exercises.map((exercise) => [exercise.id, exercise]) ?? []), [catalog]);
  const days = useMemo(() => calendarDays(month), [month]);

  const selectDate = (selected: Date) => {
    const value = localDate(selected);
    setDate(value);
    setMonth(selected);
  };

  const estimateWorkout = useCallback((workout: Workout) => {
    const exercise = exerciseMap.get(workout.exerciseId);
    return exercise ? estimateExerciseEnergy(exercise, workout.sets, profile, calibration) : undefined;
  }, [calibration, exerciseMap, profile]);

  const updateWorkout = (workout: Workout) => {
    const next = applyWorkoutCompletion(workout, estimateWorkout(workout));
    setWorkouts((items) => items.map((item) => item.id === next.id ? next : item));
    void saveWorkout(next);
  };

  return (
    <>
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
            estimateWorkout={estimateWorkout}
            estimateUnavailable={Number(profile.age) > 0 && Number(profile.age) < 6}
            onOpenDetails={setSelectedExercise}
            onRemovePlanned={async () => {
              if (!workouts.some((workout) => !workout.completed) || !window.confirm(`Remove planned trainings for ${fullDate(date)}? Completed workouts will stay.`)) return;
              await removePlannedWorkoutsForDate(date);
            }}
            onMoveFuture={async () => {
              if (!window.confirm('Move every planned training dated today or later forward by one day? Completed workouts will stay on their current dates.')) return;
              const moved = await moveFutureWorkoutsOneDay();
              if (!moved) window.alert('There are no future planned trainings to move.');
            }}
          />
        ) : (
          <FoodDay date={date} entries={food} onRecipes={() => onRecipes(date)} onProduct={() => onProduct(date)} onOpenDetails={setSelectedFood} />
        )}
      </section>
    </div>
    {selectedExercise && <ExerciseDetail exercise={selectedExercise} initialDate={date} allowScheduling={false} onClose={() => setSelectedExercise(undefined)} />}
    {selectedFood && <CalendarFoodDetail entry={selectedFood} onClose={() => setSelectedFood(undefined)} />}
    </>
  );
}

function DayHeading({ date, actions }: { date: string; actions: React.ReactNode }) {
  return (
    <div className="day-heading">
      <div><h2>{fullDate(date)}</h2></div>
      <div className="day-actions">{actions}</div>
    </div>
  );
}

function WorkoutNumberInput({
  label,
  value,
  kind,
  step,
  onChange,
}: {
  label: string;
  value: number;
  kind: WorkoutNumberKind;
  step: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);

  const finish = () => {
    editing.current = false;
    const next = finalizeWorkoutNumberDraft(draft, kind, value);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <input
      aria-label={label}
      type="number"
      min="0"
      step={step}
      placeholder={label}
      value={draft}
      onFocus={(event) => {
        editing.current = true;
        if (value === 0) event.currentTarget.select();
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const next = parseWorkoutNumberDraft(nextDraft, kind);
        if (next !== undefined && next !== value) onChange(next);
      }}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function minutesLabel(seconds: number) {
  return String(Math.round(seconds / 6) / 10);
}

function WorkoutMinutesInput({
  value,
  fallbackSeconds,
  onChange,
}: {
  value?: number;
  fallbackSeconds: number;
  onChange: (seconds: number) => void;
}) {
  const effectiveSeconds = value && value > 0 ? value : fallbackSeconds;
  const [draft, setDraft] = useState(minutesLabel(effectiveSeconds));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(minutesLabel(effectiveSeconds));
  }, [effectiveSeconds]);

  const finish = () => {
    editing.current = false;
    const minutes = Number(draft);
    const seconds = Number.isFinite(minutes) && minutes >= 0.1 ? Math.round(minutes * 60) : fallbackSeconds;
    setDraft(minutesLabel(seconds));
    if (seconds !== value) onChange(seconds);
  };

  return (
    <input
      aria-label="Minutes"
      type="number"
      min="0.1"
      step="0.1"
      placeholder="Min"
      value={draft}
      onFocus={(event) => { editing.current = true; event.currentTarget.select(); }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const minutes = Number(nextDraft);
        if (nextDraft && Number.isFinite(minutes) && minutes >= 0.1) onChange(Math.round(minutes * 60));
      }}
      onBlur={finish}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  );
}

function WorkoutDay({
  date,
  workouts,
  exerciseMap,
  onBrowse,
  onChange,
  estimateWorkout,
  estimateUnavailable,
  onOpenDetails,
  onRemovePlanned,
  onMoveFuture,
}: {
  date: string;
  workouts: Workout[];
  exerciseMap: Map<string, ExerciseCatalog['exercises'][number]>;
  onBrowse: () => void;
  onChange: (workout: Workout) => void;
  estimateWorkout: (workout: Workout) => EnergyEstimate | undefined;
  estimateUnavailable: boolean;
  onOpenDetails: (exercise: Exercise) => void;
  onRemovePlanned: () => void;
  onMoveFuture: () => void;
}) {
  return (
    <section>
      <DayHeading date={date} actions={<><button className="primary-button" onClick={onBrowse}><Plus size={17} /> Add to workout</button>{workouts.some((workout) => !workout.completed) && <button className="text-button" onClick={onRemovePlanned}><Trash2 size={17} /> Remove today trainings</button>}<button className="text-button" onClick={onMoveFuture}><RotateCw size={17} /> Move all future trainings by 1 day</button></>} />
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
            const energyProfile: EnergyProfileId = exercise ? classifyExercise(exercise) : 'resistance_general';
            const thumbnail = exercise?.media.thumbnail?.female ?? exercise?.media.thumbnail?.male;
            const liveEstimate = workout.completed ? undefined : estimateWorkout(workout);
            const calories = workout.completed ? workout.caloriesBurned : liveEstimate?.calories;
            const duration = workout.completed ? workout.energyDurationMinutes : liveEstimate?.durationMinutes;
            const equivalent = workout.completed ? workout.energyEquivalentKg : liveEstimate?.equivalentKg;
            const source = workout.completed ? workout.calorieSource : liveEstimate ? energySourceLabel(liveEstimate) : undefined;
            const sourceUrl = workout.completed ? workout.calorieSourceUrl : liveEstimate?.source.sourceUrl;
            return (
              <article className="workout-card" key={workout.id}>
                <header>
                  <button className="calendar-entry-open workout-entry-open" type="button" disabled={!exercise} onClick={() => exercise && onOpenDetails(exercise)} aria-label={`View ${workout.exerciseName} details`}>
                    {thumbnail ? <img src={thumbnail} alt="" /> : <span className="workout-placeholder"><Dumbbell /></span>}
                    <span className="workout-title">
                      <span><span className={`badge ${workout.completed ? 'solid' : 'outline'}`}>{workout.completed ? 'Completed' : 'Planned'}</span><small>{workout.sets.length} sets</small></span>
                      <strong>{workout.exerciseName}</strong>
                    </span>
                  </button>
                  <button className="icon-button" onClick={() => void removeWorkout(workout.id)} aria-label="Remove exercise"><Trash2 size={18} /></button>
                </header>
                {calories !== undefined && (
                  <div className="workout-energy">
                    <span><strong>{Math.round(duration ?? 0)} min</strong><small>Estimated duration</small></span>
                    <span><strong>{Math.round(calories)} kcal</strong><small>{workout.completed ? 'Frozen when completed' : 'Estimated energy'}</small></span>
                    <span><strong>{(equivalent ?? calories / 7700).toFixed(3)} kg</strong><small>Energy equivalent, not guaranteed weight loss</small></span>
                    {source && (sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{source}</a> : <small>{source}</small>)}
                  </div>
                )}
                {!calories && estimateUnavailable && <p className="workout-energy-unavailable">Sourced calorie estimates begin at age 6.</p>}
                <div className="set-list">
                  <div className="set-labels"><span>Set</span><span>Reps</span><span>Kg</span><span>Minutes</span><span>Done</span></div>
                  {workout.sets.map((set, index) => (
                    <div className={set.complete ? 'set-row complete' : 'set-row'} key={set.id}>
                      <strong>{index + 1}</strong>
                      <WorkoutNumberInput label="Reps" value={set.reps} kind="integer" step="1" onChange={(reps) => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, reps } : item) })} />
                      <WorkoutNumberInput label="Kg" value={set.weightKg} kind="decimal" step="0.5" onChange={(weightKg) => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, weightKg } : item) })} />
                      <WorkoutMinutesInput value={set.durationSeconds} fallbackSeconds={estimateSetDurationSeconds(set.reps, energyProfile)} onChange={(durationSeconds) => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, durationSeconds } : item) })} />
                      <button className={set.complete ? 'set-done active' : 'set-done'} aria-label="Done" onClick={() => onChange({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, complete: !item.complete } : item) })}>{set.complete ? <Check size={17} /> : <Circle size={17} />}</button>
                    </div>
                  ))}
                  <button className="add-set" onClick={() => onChange({ ...workout, sets: [...workout.sets, { id: crypto.randomUUID(), reps: 10, weightKg: 0, durationSeconds: estimateSetDurationSeconds(10, energyProfile), complete: false }] })}><Plus size={17} /> Add set</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FoodDay({ date, entries, onRecipes, onProduct, onOpenDetails }: { date: string; entries: FoodEntry[]; onRecipes: () => void; onProduct: () => void; onOpenDetails: (entry: FoodEntry) => void }) {
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
            {entries.map((entry) => <FoodRow key={entry.id} entry={entry} onOpenDetails={() => onOpenDetails(entry)} />)}
          </div>
          <p className="data-attribution">Nutrition estimates may come from DataHive, USDA FoodData Central, AI generation, or Open Food Facts.</p>
        </>
      )}
    </section>
  );
}

function FoodRow({ entry, onOpenDetails }: { entry: FoodEntry; onOpenDetails: () => void }) {
  const [date, setDate] = useState(entry.date);
  const [meal, setMeal] = useState<MealType>(entry.mealType ?? 'dinner');
  const [quantity, setQuantity] = useState(entry.quantity ?? 1);
  return (
    <article className="food-log-card">
      <button className="food-log-summary calendar-entry-open" type="button" onClick={onOpenDetails} aria-label={`View ${entry.title} details`}>
        {entry.imageUrl ? <img src={entry.imageUrl} alt="" /> : <span><Utensils /></span>}
        <div><small>{titleCase(entry.mealType ?? 'dinner')}</small><h3>{entry.title}</h3><p>{Math.round(entry.calories ?? 0)} kcal · Protein {(entry.protein ?? 0).toFixed(1)}g · Fat {(entry.fat ?? 0).toFixed(1)}g</p></div>
      </button>
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
