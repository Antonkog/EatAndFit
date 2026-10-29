import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  Check,
  Clock3,
  Play,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { localDate, scheduleWorkout } from '../data/db';
import { preferredExerciseSex, setExerciseModelPreference, type ProfileSex } from '../profile/userProfile';
import { exerciseMatches } from './search';
import type { Exercise, ExerciseCatalog } from './types';

type Gender = ProfileSex;
type MuscleGroup = { name: string; targets: string[] };

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

function preferredGender(): Gender {
  return preferredExerciseSex();
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mediaFor(exercise: Exercise, gender: Gender) {
  return {
    video: exercise.media.video?.[gender] ?? exercise.media.video?.female ?? exercise.media.video?.male,
    thumbnail: exercise.media.thumbnail?.[gender] ?? exercise.media.thumbnail?.female ?? exercise.media.thumbnail?.male,
  };
}

function secondaryMuscles(exercise: Exercise) {
  const bodyPart = exercise.body_part.toLowerCase();
  if (bodyPart.includes('chest')) return 'Triceps, shoulders';
  if (bodyPart.includes('back')) return 'Biceps, forearms';
  if (bodyPart.includes('shoulder')) return 'Triceps, trapezius';
  if (bodyPart.includes('upper arm')) return 'Forearms, shoulders';
  if (bodyPart.includes('upper leg')) return 'Glutes, calves';
  if (bodyPart.includes('lower leg')) return 'Hamstrings, quadriceps';
  if (bodyPart.includes('waist')) return 'Hip flexors, lower back';
  return 'Supporting stabilizers';
}

function ExerciseDetail({
  exercise,
  onClose,
  onAdded,
}: {
  exercise: Exercise;
  onClose: () => void;
  onAdded: (date: string) => void;
}) {
  const [gender, setGender] = useState<Gender>(preferredGender);
  const [date, setDate] = useState(localDate());
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(7);
  const media = mediaFor(exercise, gender);
  const available = new Set(Object.keys(exercise.media.video ?? {}));

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const chooseGender = (value: Gender) => {
    if (!available.has(value)) return;
    setGender(value);
    setExerciseModelPreference(value);
  };

  const add = async () => {
    setAdding(true);
    setError('');
    try {
      await scheduleWorkout(exercise.id, exercise.name, date);
      setAdded(true);
      onAdded(date);
      onClose();
    } catch {
      setError('Could not add this exercise. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={exercise.name}>
      <article className="exercise-detail-panel">
        <button className="detail-close" onClick={onClose} aria-label="Close"><X size={25} /></button>
        <div className="detail-media">
          {media.video && (
            <video
              key={`${exercise.id}-${gender}`}
              src={media.video}
              controls
              loop
              playsInline
              preload="metadata"
              poster={media.thumbnail}
              onLoadedMetadata={(event) => setDuration(Math.max(1, Math.round(event.currentTarget.duration || 7)))}
            />
          )}
          <span className="media-resolution"><Play size={13} />1920 × 1080</span>
        </div>
        <div className="exercise-detail-body">
          <header className="exercise-detail-header">
            <div className="badge-row">
              <span className="badge solid">{titleCase(exercise.body_part)}</span>
              <span className="badge solid">{titleCase(exercise.difficulty)}</span>
              <span className="duration"><Clock3 size={13} /> {duration} sec</span>
            </div>
            <h2>{exercise.name}</h2>
            <span className="muscle-pill">{titleCase(exercise.body_part)}</span>
          </header>

          <div className="exercise-detail-sections">
            <section>
              <h3>Demonstration model</h3>
              <div className="segmented detail-model">
                <button className={gender === 'female' ? 'active' : ''} disabled={!available.has('female')} onClick={() => chooseGender('female')}>Female</button>
                <button className={gender === 'male' ? 'active' : ''} disabled={!available.has('male')} onClick={() => chooseGender('male')}>Male</button>
              </div>
            </section>
            <section>
              <h3>Description</h3>
              <p>{exercise.short_description || exercise.instructions}</p>
              {exercise.instructions && exercise.instructions !== exercise.short_description && <p>{exercise.instructions}</p>}
            </section>
            <section>
              <h3>Technique</h3>
              <ol className="technique-list">
                {exercise.steps.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span><p>{step}</p></li>)}
              </ol>
            </section>
            {exercise.formCues.length > 0 && <InfoList title="Form cues" items={exercise.formCues} />}
            {exercise.commonMistakes.length > 0 && (
              <section className="mistakes-panel">
                <h4><AlertTriangle size={17} /> Common mistakes</h4>
                <BulletList items={exercise.commonMistakes} />
              </section>
            )}
            {exercise.breathing && <section><h3>Breathing</h3><p>{exercise.breathing}</p></section>}
            <section>
              <h3>Exercise details</h3>
              <dl className="exercise-facts">
                <Fact label="Target" value={exercise.target} />
                <Fact label="Equipment" value={exercise.equipment} />
                <Fact label="Secondary muscles" value={secondaryMuscles(exercise)} />
                <Fact label="Compound" value={exercise.compound ? 'Yes' : 'No'} />
                <Fact label="Unilateral" value={exercise.unilateral ? 'Yes' : 'No'} />
              </dl>
            </section>
          </div>
          <footer className="exercise-detail-footer">
            {error && <p className="form-error">{error}</p>}
            <label>Workout date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <button className="primary-button" disabled={adding} onClick={() => void add()}>
              {added ? <Check size={18} /> : <CalendarPlus size={18} />}
              {adding ? 'Adding…' : added ? 'Added' : 'Add to workout'}
            </button>
          </footer>
        </div>
      </article>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return <section><h3>{title}</h3><BulletList items={items} /></section>;
}

function BulletList({ items }: { items: string[] }) {
  return <ul className="bullet-list">{items.map((item) => <li key={item}><i /> <span>{item}</span></li>)}</ul>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{titleCase(value)}</dd></div>;
}

export function ExerciseLibrary({ onWorkoutAdded }: { onWorkoutAdded: (date: string) => void }) {
  const [catalog, setCatalog] = useState<ExerciseCatalog>();
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup>();
  const [selected, setSelected] = useState<Exercise>();

  useEffect(() => {
    void fetch('/data/catalog.json').then((response) => response.json()).then(setCatalog);
  }, []);

  const groupedExercises = useMemo(
    () => new Map(muscleGroups.map((group) => [group.name, (catalog?.exercises ?? []).filter((exercise) => group.targets.includes(exercise.target.toLowerCase()))])),
    [catalog],
  );
  const visible = useMemo(
    () => (selectedGroup ? groupedExercises.get(selectedGroup.name) ?? [] : []).filter((item) => exerciseMatches(item, query)),
    [groupedExercises, query, selectedGroup],
  );

  if (!catalog) return <section className="skeleton-grid">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</section>;

  if (!selectedGroup) {
    return (
      <section className="muscle-browser">
        <div className="exercise-hero">
          <div className="hero-copy">
            <h1>Choose what you train today.</h1>
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
            const cover = exercises[0] ? mediaFor(exercises[0], preferredGender()).thumbnail : undefined;
            return (
              <button className={`muscle-card ${index === 0 ? 'featured' : ''}`} key={group.name} onClick={() => { setSelectedGroup(group); setQuery(''); }}>
                {cover && <img src={cover} alt="" loading={index < 5 ? 'eager' : 'lazy'} />}
                <span className="muscle-shade" />
                <span className="muscle-label"><strong>{group.name}</strong><small><i /> {exercises.length} movements</small></span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="exercise-list-heading">
        <button className="back-button" onClick={() => setSelectedGroup(undefined)}><ArrowLeft size={17} /> Back to muscles</button>
        <div className="exercise-list-title">
          <div><span className="badge outline">{visible.length} movements</span><h1>{selectedGroup.name}</h1></div>
          <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" /></label>
        </div>
      </section>
      <section className="exercise-grid">
        {visible.map((exercise) => {
          const media = mediaFor(exercise, preferredGender());
          return (
            <button className="exercise-card" key={exercise.id} onClick={() => setSelected(exercise)} aria-label={exercise.name}>
              {media.thumbnail && <img loading="lazy" src={media.thumbnail} alt="" />}
              <span><small>{exercise.body_part}</small><strong>{exercise.name}</strong><em>7 sec</em></span>
            </button>
          );
        })}
      </section>
      {visible.length === 0 && <div className="empty-card"><p>No exercises match your search.</p></div>}
      {selected && <ExerciseDetail exercise={selected} onClose={() => setSelected(undefined)} onAdded={onWorkoutAdded} />}
    </>
  );
}
