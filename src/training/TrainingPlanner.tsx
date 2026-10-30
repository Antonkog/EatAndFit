import { CalendarDays, Download, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { allWorkouts, localDate, saveTrainingPlan, type Workout } from '../data/db';
import { estimateDurationSeconds, estimateExerciseEnergy, estimateSetDurationSeconds } from '../energy/estimates';
import { classifyExercise } from '../energy/sources';
import type { ExerciseCatalog } from '../exercises/types';
import { readUserProfile } from '../profile/userProfile';
import { getRecognitionCredential } from '../settings/secureKeys';
import { ensureEnergyCalibration } from './calibration';
import { downloadTrainingPlan, trainingPlanCsv, trainingPlanText, type TrainingPlanExportRow } from './export';
import { defaultTrainingDates, generateTrainingPlan } from './generation';
import type { GeneratedTrainingPlan } from './types';

const goalLabels = { lose_weight: 'Lose weight', build_muscle: 'Build muscle', stay_fit: 'Stay fit' } as const;

export function TrainingPlanner({ catalog, onClose, onSaved }: { catalog: ExerciseCatalog; onClose: () => void; onSaved: (date: string) => void }) {
  const profile = readUserProfile();
  const goal = profile.trainingGoal ?? 'stay_fit';
  const [plan, setPlan] = useState<GeneratedTrainingPlan>();
  const [dates, setDates] = useState(defaultTrainingDates);
  const [factor, setFactor] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const generationStarted = useRef(false);
  const byId = useMemo(() => new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])), [catalog]);

  const setsForItem = (item: GeneratedTrainingPlan['sessions'][number]['exercises'][number]) => {
    const exercise = byId.get(item.exerciseId);
    const durationSeconds = item.durationMinutes
      ? Math.round(item.durationMinutes * 60)
      : estimateSetDurationSeconds(item.reps ?? 0, exercise ? classifyExercise(exercise) : 'resistance_general');
    return Array.from({ length: item.sets }, () => ({ reps: item.reps ?? 0, durationSeconds }));
  };

  const sessionTotals = useMemo(() => plan?.sessions.map((session) => session.exercises.reduce((total, item) => {
    const exercise = byId.get(item.exerciseId);
    if (!exercise) return total;
    const estimate = estimateExerciseEnergy(exercise, setsForItem(item), profile, factor);
    return total + (estimate?.calories ?? 0);
  }, 0)) ?? [], [byId, factor, plan, profile]);

  const exportRows = useMemo<TrainingPlanExportRow[]>(() => plan?.sessions.flatMap((session, sessionIndex) => session.exercises.map((item) => {
    const exercise = byId.get(item.exerciseId)!;
    const sets = setsForItem(item);
    const estimate = estimateExerciseEnergy(exercise, sets, profile, factor);
    return {
      session: sessionIndex + 1,
      date: dates[sessionIndex],
      sessionTitle: session.title,
      exercise: exercise.name,
      sets: item.sets,
      reps: item.reps ?? 0,
      estimatedMinutes: estimate?.durationMinutes ?? estimateDurationSeconds(sets, classifyExercise(exercise)) / 60,
      startingWeightKg: 0,
      estimatedCalories: estimate?.calories ?? 0,
    };
  })) ?? [], [byId, dates, factor, plan, profile]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const credential = await getRecognitionCredential();
      if (!credential) throw new Error('Add and verify an AI provider key in Settings first.');
      const calibration = await ensureEnergyCalibration(catalog, profile, credential).catch(() => undefined);
      setFactor(calibration);
      setPlan(await generateTrainingPlan(profile, goal, catalog, credential));
      setDates(defaultTrainingDates());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The training plan could not be generated.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (generationStarted.current) return;
    generationStarted.current = true;
    void generate();
  }, []);

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
          sets: setsForItem(item).map((set) => ({ id: crypto.randomUUID(), reps: set.reps, weightKg: 0, durationSeconds: set.durationSeconds, complete: false })),
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
        <header><span className="profile-setup-icon"><Sparkles /></span><h2 id="training-planner-title">Personalized training program</h2><p>AI uses your adult profile and only exercises available in Eat &amp; Fit. Review every session before adding it to your calendar.</p></header>
        {!plan && <button className="primary-button large full" disabled={loading} onClick={() => void generate()}>{loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{loading ? 'Creating your plan…' : 'Try again'}</button>}
        {plan && (
          <div className="training-plan-sessions">
            {plan.sessions.map((session, index) => (
              <article key={`${index}-${session.title}`}>
                <header><div><small>Session {index + 1}</small><h3>{session.title}</h3></div><label><CalendarDays size={15} /><input type="date" min={new Date().toISOString().slice(0, 10)} value={dates[index]} onChange={(event) => setDates((items) => items.map((date, itemIndex) => itemIndex === index ? event.target.value : date))} /></label></header>
                <ul>{session.exercises.map((item) => {
                  const row = exportRows.find((entry) => entry.session === index + 1 && entry.exercise === byId.get(item.exerciseId)?.name);
                  const prescription = item.reps ? `${item.sets} sets × ${item.reps} reps` : `${item.sets} sets × ${item.durationMinutes?.toFixed(1) ?? '0.5'} min`;
                  return <li key={item.exerciseId}><span>{byId.get(item.exerciseId)?.name}</span><small>{prescription} · {row?.estimatedMinutes.toFixed(1) ?? '0.5'} min total · 0 kg</small></li>;
                })}</ul>
                <p className="session-energy">Estimated {Math.round(sessionTotals[index] ?? 0)} kcal · {(sessionTotals[index] / 7700).toFixed(3)} kg energy equivalent</p>
              </article>
            ))}
            <p className="estimate-disclaimer">Energy equivalents are rough exercise-energy comparisons, not guaranteed weight loss.</p>
            <div className="training-plan-actions">
              <button className="text-button" onClick={() => downloadTrainingPlan('eat-and-fit-training-plan.csv', trainingPlanCsv(exportRows), 'text/csv;charset=utf-8')}><Download size={16} /> Export CSV</button>
              <button className="text-button" onClick={() => downloadTrainingPlan('eat-and-fit-training-plan.txt', trainingPlanText(exportRows, goalLabels[goal]), 'text/plain;charset=utf-8')}><Download size={16} /> Export TXT</button>
              <button className="text-button" onClick={() => { setPlan(undefined); void generate(); }}>Generate again</button>
              <button className="primary-button" disabled={saving} onClick={() => void confirm()}>{saving ? 'Saving…' : 'Confirm and add to Calendar'}</button>
            </div>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
