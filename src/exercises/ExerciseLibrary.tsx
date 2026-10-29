import { ArrowLeft, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { exerciseMatches } from './search';
import type { Exercise, ExerciseCatalog } from './types';
import { scheduleWorkout } from '../data/db';

type Gender = 'female' | 'male';

type MuscleGroup = {
  name: string;
  targets: string[];
};

export const muscleGroups: MuscleGroup[] = [
  { name: 'Neck', targets: ['neck flexors', 'sternocleidomastoid'] },
  { name: 'Front deltoids', targets: ['anterior deltoid'] },
  { name: 'Shoulders', targets: ['deltoids', 'delts'] },
  { name: 'Rear deltoids', targets: ['posterior deltoid', 'rear deltoids'] },
  { name: 'Chest', targets: ['pectorals', 'upper pectorals'] },
  { name: 'Biceps', targets: ['biceps'] },
  { name: 'Triceps', targets: ['triceps'] },
  { name: 'Forearms', targets: ['forearms', 'forearm extensors'] },
  { name: 'Abdominals', targets: ['abdominals', 'abs', 'rectus abdominis'] },
  { name: 'Obliques', targets: ['obliques'] },
  { name: 'Back', targets: ['upper back', 'middle back', 'rhomboids', 'thoracic spine'] },
  { name: 'Latissimus dorsi', targets: ['lats'] },
  { name: 'Trapezius', targets: ['traps'] },
  { name: 'Erector spinae', targets: ['erector spinae', 'erectors', 'spinal erectors', 'spine'] },
  { name: 'Glutes', targets: ['glutes'] },
  { name: 'Quadriceps', targets: ['quadriceps', 'quads'] },
  { name: 'Hip adductors', targets: ['adductors'] },
  { name: 'Hip abductors', targets: ['abductors', 'gluteus medius'] },
  { name: 'Hamstrings', targets: ['hamstrings'] },
  { name: 'Calves', targets: ['calves', 'peroneals'] },
  { name: 'Hip flexors', targets: ['hip flexors'] },
  { name: 'Full body & mobility', targets: ['cardiovascular system', 'full body'] },
];

function ExerciseDetail({ exercise, gender, onClose }: { exercise: Exercise; gender: Gender; onClose: () => void }) {
  const video = exercise.media.video?.[gender] ?? exercise.media.video?.female ?? exercise.media.video?.male;
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={exercise.name}>
      <article className="detail-panel">
        <button className="detail-close" onClick={onClose}><X size={20} /> Close</button>
        {video && <video src={video} controls muted playsInline poster={exercise.media.thumbnail?.[gender]} />}
        <div className="detail-content">
          <p className="eyebrow">{exercise.body_part} · {exercise.difficulty}</p>
          <h2>{exercise.name}</h2>
          <p>{exercise.short_description}</p>
          <dl className="facts"><div><dt>Target</dt><dd>{exercise.target}</dd></div><div><dt>Equipment</dt><dd>{exercise.equipment}</dd></div></dl>
          <h3>How to do it</h3>
          <ol>{exercise.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <div className="guidance-grid"><section><h3>Form cues</h3><ul>{exercise.formCues.map((cue) => <li key={cue}>{cue}</li>)}</ul></section><section className="warning"><h3>Common mistakes</h3><ul>{exercise.commonMistakes.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
          <h3>Breathing</h3><p>{exercise.breathing}</p>
          <button className="primary-button" onClick={() => void scheduleWorkout(exercise.id, exercise.name).then(() => window.alert('Added to today’s workout.'))}>Add to today</button>
        </div>
      </article>
    </div>
  );
}

export function ExerciseLibrary() {
  const [catalog, setCatalog] = useState<ExerciseCatalog>();
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup>();
  const [gender, setGender] = useState<Gender>(() => localStorage.getItem('eatfit-model') === 'male' ? 'male' : 'female');
  const [selected, setSelected] = useState<Exercise>();
  useEffect(() => { void fetch('/data/catalog.json').then((response) => response.json()).then(setCatalog); }, []);
  const groupedExercises = useMemo(() => new Map(muscleGroups.map((group) => [group.name, (catalog?.exercises ?? []).filter((exercise) => group.targets.includes(exercise.target.toLowerCase()))])), [catalog]);
  const visible = useMemo(() => (selectedGroup ? groupedExercises.get(selectedGroup.name) ?? [] : []).filter((item) => exerciseMatches(item, query)), [groupedExercises, query, selectedGroup]);
  const chooseGender = (value: Gender) => { setGender(value); localStorage.setItem('eatfit-model', value); };

  if (!catalog) return <section className="empty-card"><p>Loading exercise library…</p></section>;
  if (!selectedGroup) return (
    <section className="muscle-browser">
      <div className="exercise-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> PRIVATE TRAINING LIBRARY</p>
          <h1>Choose what<br />you train today.</h1>
          <p>Start with a muscle group, then save an exercise to your local calendar.</p>
        </div>
        <div className="hero-stats" aria-label="Library statistics">
          <div><strong>{muscleGroups.length}</strong><span>Muscle groups</span></div>
          <div><strong>{catalog.exercises.length}</strong><span>Exercises</span></div>
        </div>
      </div>
      <div className="muscle-grid">
        {muscleGroups.map((group, index) => {
          const exercises = groupedExercises.get(group.name) ?? [];
          const cover = exercises[0]?.media.thumbnail?.[gender] ?? exercises[0]?.media.thumbnail?.female ?? exercises[0]?.media.thumbnail?.male;
          return <button className={`muscle-card ${index === 0 ? 'featured' : ''}`} key={group.name} onClick={() => { setSelectedGroup(group); setQuery(''); }}>
            {cover && <img src={cover} alt="" loading={index < 5 ? 'eager' : 'lazy'} />}
            <span className="muscle-shade" />
            <span className="muscle-label"><strong>{group.name}</strong><small><i /> {exercises.length} movements</small></span>
          </button>;
        })}
      </div>
    </section>
  );
  return (
    <>
      <section className="exercise-list-heading">
        <button className="back-button" onClick={() => setSelectedGroup(undefined)}><ArrowLeft size={17} /> All muscle groups</button>
        <div className="exercise-list-title">
          <div><p className="eyebrow">TRAINING LIBRARY</p><h1>{selectedGroup.name}</h1><p>{visible.length} movements</p></div>
          <div className="exercise-list-tools">
            <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" /></label>
            <div className="segmented" aria-label="Demonstration model"><button className={gender === 'female' ? 'active' : ''} onClick={() => chooseGender('female')}>Female</button><button className={gender === 'male' ? 'active' : ''} onClick={() => chooseGender('male')}>Male</button></div>
          </div>
        </div>
      </section>
      <section className="exercise-grid">
        {visible.map((exercise) => <button className="exercise-card" key={exercise.id} onClick={() => setSelected(exercise)}><img loading="lazy" src={exercise.media.thumbnail?.[gender] ?? exercise.media.thumbnail?.female} alt="" /><span><small>{exercise.body_part} · {exercise.equipment}</small><strong>{exercise.name}</strong><em>{exercise.target}</em></span></button>)}
      </section>
      {visible.length === 0 && <div className="empty-card"><p>No exercises match your search.</p></div>}
      {selected && <ExerciseDetail exercise={selected} gender={gender} onClose={() => setSelected(undefined)} />}
    </>
  );
}

