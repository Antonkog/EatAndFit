import { Activity } from 'lucide-react';
import { ProfileForm } from './ProfileForm';
import { dismissProfileSetup } from './userProfile';

export function ProfileSetupDialog({ onFinished }: { onFinished: () => void }) {
  const skip = () => {
    dismissProfileSetup();
    onFinished();
  };

  return (
    <div className="profile-setup-backdrop">
      <section className="profile-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-setup-title">
        <span className="profile-setup-icon"><Activity /></span>
        <p className="eyebrow">A quick setup</p>
        <h2 id="profile-setup-title">Personalize Eat &amp; Fit</h2>
        <p>Age, sex, weight, and height are needed for age-appropriate calorie estimates. Your sex also selects the matching exercise demonstration images. We don’t save your personal data, it stays in your own browser. You can edit these details later in Settings. If you choose not now, this setup will return after two hours until your profile is complete.</p>
        <ProfileForm submitLabel="Save and continue" onSaved={onFinished} />
        <button className="profile-skip" type="button" onClick={skip}>Not now</button>
      </section>
    </div>
  );
}
