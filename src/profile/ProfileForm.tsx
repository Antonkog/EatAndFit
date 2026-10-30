import { CalendarDays, Ruler, Scale, Target } from 'lucide-react';
import { useState } from 'react';
import { profileIssue, readUserProfile, saveUserProfile, type ProfileSex, type TrainingGoal, type UserProfile } from './userProfile';

const goals: Array<{ value: TrainingGoal; label: string }> = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'stay_fit', label: 'Stay fit and healthy' },
];

export function ProfileForm({ onSaved, submitLabel = 'Save profile' }: { onSaved?: (profile: UserProfile) => void; submitLabel?: string }) {
  const initial = readUserProfile();
  const [sex, setSex] = useState<ProfileSex | ''>(initial.sex ?? '');
  const [age, setAge] = useState(initial.age ? String(initial.age) : '');
  const [weight, setWeight] = useState(initial.weightKg ? String(initial.weightKg) : '');
  const [height, setHeight] = useState(initial.heightCm ? String(initial.heightCm) : '');
  const [trainingGoal, setTrainingGoal] = useState<TrainingGoal | ''>(initial.trainingGoal ?? '');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const numericAge = Number(age);
    const profile: UserProfile = {
      sex: sex || undefined,
      age: numericAge,
      weightKg: Number(weight),
      heightCm: Number(height),
      trainingGoal: numericAge >= 19 ? trainingGoal || undefined : undefined,
    };
    const issue = profileIssue(profile);
    if (issue) { setError(issue); return; }
    const saved = saveUserProfile(profile);
    setError('');
    onSaved?.(saved);
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <fieldset className="profile-sex">
        <legend>Sex</legend>
        <div>
          {(['female', 'male'] as const).map((value) => (
            <label className={sex === value ? 'active' : ''} key={value}>
              <input type="radio" name="profile-sex" value={value} checked={sex === value} onChange={() => setSex(value)} />
              <strong>{value === 'female' ? 'Female' : 'Male'}</strong>
              <small>Use {value} exercise demonstrations</small>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="profile-measurements">
        <label><span><CalendarDays size={16} /> Age</span><span><input type="number" inputMode="numeric" min="1" max="120" step="1" value={age} onChange={(event) => setAge(event.target.value)} placeholder="30" /> years</span></label>
        <label><span><Scale size={16} /> Weight</span><span><input type="number" inputMode="decimal" min="2" max="400" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="70" /> kg</span></label>
        <label><span><Ruler size={16} /> Height</span><span><input type="number" inputMode="decimal" min="40" max="250" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="175" /> cm</span></label>
      </div>
      {Number(age) >= 19 && (
        <fieldset className="profile-goal">
          <legend><Target size={16} /> Training goal</legend>
          <div>
            {goals.map((goal) => (
              <label className={trainingGoal === goal.value ? 'active' : ''} key={goal.value}>
                <input type="radio" name="training-goal" value={goal.value} checked={trainingGoal === goal.value} onChange={() => setTrainingGoal(goal.value)} />
                <strong>{goal.label}</strong>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button large full" type="submit">{submitLabel}</button>
    </form>
  );
}
