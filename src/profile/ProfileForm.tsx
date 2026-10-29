import { Ruler, Scale } from 'lucide-react';
import { useState } from 'react';
import { profileIssue, readUserProfile, saveUserProfile, type ProfileSex, type UserProfile } from './userProfile';

export function ProfileForm({ onSaved, submitLabel = 'Save profile' }: { onSaved?: (profile: UserProfile) => void; submitLabel?: string }) {
  const initial = readUserProfile();
  const [sex, setSex] = useState<ProfileSex | ''>(initial.sex ?? '');
  const [weight, setWeight] = useState(initial.weightKg ? String(initial.weightKg) : '');
  const [height, setHeight] = useState(initial.heightCm ? String(initial.heightCm) : '');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const profile: UserProfile = { sex: sex || undefined, weightKg: Number(weight), heightCm: Number(height) };
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
        <label><span><Scale size={16} /> Weight</span><span><input type="number" inputMode="decimal" min="20" max="400" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="70" /> kg</span></label>
        <label><span><Ruler size={16} /> Height</span><span><input type="number" inputMode="decimal" min="80" max="250" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="175" /> cm</span></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button large full" type="submit">{submitLabel}</button>
    </form>
  );
}
