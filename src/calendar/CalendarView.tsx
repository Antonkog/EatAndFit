import { Check, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { localDate, removeWorkout, saveWorkout, workoutsForDate, type Workout } from '../data/db';

export function CalendarView() {
  const [date, setDate] = useState(localDate());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const refresh = useCallback(() => { void workoutsForDate(date).then(setWorkouts); }, [date]);
  useEffect(() => { refresh(); window.addEventListener('eatfit-data-change', refresh); return () => window.removeEventListener('eatfit-data-change', refresh); }, [refresh]);
  const change = (workout: Workout) => { setWorkouts((items) => items.map((item) => item.id === workout.id ? workout : item)); void saveWorkout(workout); };
  return (
    <section>
      <div className="calendar-heading"><div><p className="eyebrow">TRAINING LOG</p><h2>Your day</h2></div><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      {workouts.length === 0 ? <div className="empty-card"><p>No exercises scheduled. Open an exercise and add it to this day.</p></div> : <div className="workout-list">{workouts.map((workout) => <article className="workout-card" key={workout.id}><header><div><small>{workout.completed ? 'Completed' : 'Planned'}</small><h3>{workout.exerciseName}</h3></div><button className="icon-button" onClick={() => void removeWorkout(workout.id)} aria-label="Remove workout"><Trash2 size={18} /></button></header><div className="set-list">{workout.sets.map((set, index) => <div className="set-row" key={set.id}><span>Set {index + 1}</span><label><input type="number" min="0" value={set.reps} onChange={(event) => change({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, reps: Number(event.target.value) } : item) })} /> reps</label><label><input type="number" min="0" step="0.5" value={set.weightKg} onChange={(event) => change({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, weightKg: Number(event.target.value) } : item) })} /> kg</label><button className={set.complete ? 'set-done active' : 'set-done'} onClick={() => change({ ...workout, sets: workout.sets.map((item) => item.id === set.id ? { ...item, complete: !item.complete } : item) })}><Check size={17} /></button></div>)}</div><footer><button className="text-button" onClick={() => change({ ...workout, sets: [...workout.sets, { id: crypto.randomUUID(), reps: 10, weightKg: 0, complete: false }] })}><Plus size={17} /> Add set</button><button className="primary-button" onClick={() => change({ ...workout, completed: !workout.completed })}>{workout.completed ? 'Mark planned' : 'Finish exercise'}</button></footer></article>)}</div>}
    </section>
  );
}

