import { CalendarDays, LoaderCircle, Sparkles, Target, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { allWorkouts, localDate, saveTrainingPlan, type Workout } from '../data/db';
import { estimateExerciseEnergy } from '../energy/estimates';
import type { ExerciseCatalog } from '../exercises/types';
import { readUserProfile, saveUserProfile, type TrainingGoal } from '../profile/userProfile';
import { getRecognitionCredential } from '../settings/secureKeys';
import { ensureEnergyCalibration } from './calibration';
import { defaultTrainingDates, generateTrainingPlan } from './generation';
import type { GeneratedTrainingPlan } from './types';

const goals: Array<{ value: TrainingGoal; label: string; description: string }> = [
  { value: 'lose_weight', label: 'Lose weight', description: 'A balanced resistance program with active sessions.' },
  { value: 'build_muscle', label: 'Build muscle', description: 'Progressive full-body resistance sessions.' },
  { value: 'stay_fit', label: 'Stay fit and healthy', description: 'Varied strength, mobility, and conditioning.' },
];

export function TrainingPlanner({ catalog, onClose, onSaved }: { catalog: ExerciseCatalog; onClose: () => void; onSaved: (date: string) => void }) {
  const profile = readUserProfile();
  const [goal, setGoal] = useState<TrainingGoal>(profile.trainingGoal ?? 'stay_fit');
  const [plan, setPlan] = useState<GeneratedTrainingPlan>();
  const [dates, setDates] = useState(defaultTrainingDates);
  const [factor, setFactor] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const byId = useMemo(() => new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])), [catalog]);

  const sessionTotals = useMemo(() => plan?.sessions.map((session) => session.exercises.reduce((total, item) => {
    const exercise = byId.get(item.exerciseId);
    if (!exercise) return total;
    const estimate = estimateExerciseEnergy(exercise, Array.from({ length: item.sets }, () => ({ reps: item.reps ?? 0, durationSeconds: item.durationSeconds })), profile, factor);
    return total + (estimate?.calories ?? 0);
  }, 0)) ?? [], [byId, factor, plan, profile]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const credential = await getRecognitionCredential();
      if (!credential) throw new Error('Add and verify an AI provider key in Settings first.');
      const updatedProfile = saveUserProfile({ ...profile, trainingGoal: goal });
      const calibration = await ensureEnergyCalibration(catalog, updatedProfile, credential).catch(() => undefined);
      setFactor(calibration);
      setPlan(await generateTrainingPlan(updatedProfile, goal, catalog, credential));
      setDates(defaultTrainingDates());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The training plan could not be generated.');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!plan) return;
    if (dates.some((date) => !date || date < localDate()) || new Set(dates).size !== dates.length || dates.some((date, index) => index > 0 && date <= dates[index - 1])) {
      setError('Choose six different future training dates in chronological order.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const existing = await allWorkouts();
      const conflicts = dates.filter((date) => existing.some((workout) => workout.date === date));
      if (conflicts.length && !window.confirm(`${conflicts.length} selected date${conflicts.length === 1 ? '' : 's'} already contain workouts. Append this plan?`)) return;
      const planId = crypto.randomUUID();
      const workouts: Workout[] = plan.sessions.flatMap((session, sessionIndex) => session.exercises.map((item) => {
        const exercise = byId.get(item.exerciseId)!;
        return {
          id: crypto.randomUUID(),
          date: dates[sessionIndex],
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          notes: session.title,
          completed: false,
          trainingPlanId: planId,
          sets: Array.from({ length: item.sets }, () => ({ id: crypto.randomUUID(), reps: item.reps ?? 0, weightKg: 0, ...(item.durationSeconds ? { durationSeconds: item.durationSeconds } : {}), complete: false })),
        };
      }));
      await saveTrainingPlan(workouts);
      onSaved(dates[0]);
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The plan could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="detail-overlay training-planner-overlay" role="dialog" aria-modal="true" aria-labelledby="training-planner-title">
      <section className="training-planner">
        <button className="detail-close" onClick={onClose} aria-label="Close"><X size={24} /></button>
        <header><span className="profile-setup-icon"><Sparkles /></span><p className="eyebrow">Two-week program</p><h2 id="training-planner-title">Personalized training program</h2><p>AI uses your adult profile and only exercises available in Eat &amp; Fit. Review every session before adding it to your calendar.</p></header>
        <fieldset className="training-goals">
          <legend><Target size={17} /> What do you want to achieve?</legend>
          <div>{goals.map((item) => <label className={goal === item.value ? 'active' : ''} key={item.value}><input type="radio" name="planner-goal" checked={goal === item.value} onChange={() => setGoal(item.value)} /><strong>{item.label}</strong><small>{item.description}</small></label>)}</div>
        </fieldset>
        {!plan && <button className="primary-button large full" disabled={loading} onClick={() => void generate()}>{loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{loading ? 'Creating your plan…' : 'Create two-week plan'}</button>}
        {plan && (
          <div className="training-plan-sessions">
            {plan.sessions.map((session, index) => (
              <article key={`${index}-${session.title}`}>
                <header><div><small>Session {index + 1}</small><h3>{session.title}</h3></div><label><CalendarDays size={15} /><input type="date" min={new Date().toISOString().slice(0, 10)} value={dates[index]} onChange={(event) => setDates((items) => items.map((date, itemIndex) => itemIndex === index ? event.target.value : date))} /></label></header>
                <ul>{session.exercises.map((item) => <li key={item.exerciseId}><span>{byId.get(item.exerciseId)?.name}</span><small>{item.sets} sets × {item.durationSeconds ? `${item.durationSeconds} sec` : `${item.reps} reps`} · 0 kg</small></li>)}</ul>
                <p className="session-energy">Estimated {Math.round(sessionTotals[index] ?? 0)} kcal · {(sessionTotals[index] / 7700).toFixed(3)} kg energy equivalent</p>
              </article>
            ))}
            <p className="estimate-disclaimer">Energy equivalents are rough exercise-energy comparisons, not guaranteed weight loss.</p>
            <div className="training-plan-actions"><button className="text-button" onClick={() => setPlan(undefined)}>Generate again</button><button className="primary-button" disabled={saving} onClick={() => void confirm()}>{saving ? 'Saving…' : 'Confirm and add to Calendar'}</button></div>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
