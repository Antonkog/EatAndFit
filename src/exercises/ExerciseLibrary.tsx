import { ArrowLeft, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { exerciseMatches } from './search';
import type { Exercise, ExerciseCatalog } from './types';

type Gender = 'female' | 'male';

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
        </div>
      </article>
    </div>
  );
}

export function ExerciseLibrary() {
  const [catalog, setCatalog] = useState<ExerciseCatalog>();
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState('all');
  const [gender, setGender] = useState<Gender>(() => localStorage.getItem('eatfit-model') === 'male' ? 'male' : 'female');
  const [selected, setSelected] = useState<Exercise>();
  useEffect(() => { void fetch('/data/catalog.json').then((response) => response.json()).then(setCatalog); }, []);
  const bodyParts = useMemo(() => [...new Set(catalog?.exercises.map((item) => item.body_part) ?? [])].sort(), [catalog]);
  const visible = useMemo(() => (catalog?.exercises ?? []).filter((item) => (bodyPart === 'all' || item.body_part === bodyPart) && exerciseMatches(item, query)), [catalog, bodyPart, query]);
  const chooseGender = (value: Gender) => { setGender(value); localStorage.setItem('eatfit-model', value); };

  if (!catalog) return <section className="empty-card"><p>Loading exercise library…</p></section>;
  return (
    <>
      <section className="library-toolbar">
        <label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises, muscles, or equipment" /></label>
        <select value={bodyPart} onChange={(event) => setBodyPart(event.target.value)} aria-label="Filter by body part"><option value="all">All body parts</option>{bodyParts.map((part) => <option key={part}>{part}</option>)}</select>
        <div className="segmented" aria-label="Demonstration model"><button className={gender === 'female' ? 'active' : ''} onClick={() => chooseGender('female')}>Female</button><button className={gender === 'male' ? 'active' : ''} onClick={() => chooseGender('male')}>Male</button></div>
      </section>
      <p className="result-count">{visible.length} exercises</p>
      <section className="exercise-grid">
        {visible.map((exercise) => <button className="exercise-card" key={exercise.id} onClick={() => setSelected(exercise)}><img loading="lazy" src={exercise.media.thumbnail?.[gender] ?? exercise.media.thumbnail?.female} alt="" /><span><small>{exercise.body_part} · {exercise.equipment}</small><strong>{exercise.name}</strong><em>{exercise.target}</em></span></button>)}
      </section>
      {selected && <ExerciseDetail exercise={selected} gender={gender} onClose={() => setSelected(undefined)} />}
    </>
  );
}

