import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeUserProfile, PROFILE_SETUP_REMINDER_MS, profileIssue, shouldPromptForProfile } from '../src/profile/userProfile';

test('profile validation accepts supported sex, age, goal, and realistic metric values', () => {
  assert.equal(profileIssue({ sex: 'female', age: 18, weightKg: 62.5, heightCm: 168 }), '');
  assert.equal(profileIssue({ sex: 'male', age: 35, weightKg: 84, heightCm: 184, trainingGoal: 'build_muscle' }), '');
  assert.match(profileIssue({ age: 20, weightKg: 84, heightCm: 184, trainingGoal: 'stay_fit' }), /male or female/);
  assert.match(profileIssue({ sex: 'male', age: 0, weightKg: 84, heightCm: 184 }), /age/);
  assert.match(profileIssue({ sex: 'male', age: 25, weightKg: 0, heightCm: 184, trainingGoal: 'lose_weight' }), /weight/);
  assert.match(profileIssue({ sex: 'female', age: 25, weightKg: 62, heightCm: 400, trainingGoal: 'stay_fit' }), /height/);
  assert.match(profileIssue({ sex: 'female', age: 25, weightKg: 62, heightCm: 168 }), /training goal/);
});

test('stored profiles discard unsupported or out-of-range fields', () => {
  assert.deepEqual(normalizeUserProfile({ sex: 'male', age: '34', weightKg: '82.5', heightCm: '180', trainingGoal: 'stay_fit' }), { sex: 'male', age: 34, weightKg: 82.5, heightCm: 180, trainingGoal: 'stay_fit' });
  assert.deepEqual(normalizeUserProfile({ sex: 'female', age: 16, weightKg: 55, heightCm: 165, trainingGoal: 'build_muscle' }), { sex: 'female', age: 16, weightKg: 55, heightCm: 165 });
  assert.deepEqual(normalizeUserProfile({ sex: 'other', age: 130, weightKg: -2, heightCm: 'wrong', trainingGoal: 'unknown' }), {});
});

test('first-launch profile, Settings editing, and exercise media are integrated', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/settings/SettingsView.tsx', import.meta.url), 'utf8');
  const exercises = readFileSync(new URL('../src/exercises/ExerciseLibrary.tsx', import.meta.url), 'utf8');
  assert.match(app, /shouldShowProfileSetup/);
  assert.match(app, /ProfileSetupDialog/);
  assert.match(settings, /Personal profile/);
  assert.match(settings, /ProfileForm/);
  assert.match(exercises, /preferredExerciseSex/);
});

test('incomplete profile returns after the two-hour dismissal window', () => {
  const source = readFileSync(new URL('../src/profile/userProfile.ts', import.meta.url), 'utf8');
  const incomplete = { sex: 'male' as const };
  const complete = { sex: 'male' as const, age: 35, weightKg: 80, heightCm: 180, trainingGoal: 'stay_fit' as const };
  const now = 1_000_000_000;
  assert.equal(shouldPromptForProfile(incomplete, null, now), true);
  assert.equal(shouldPromptForProfile(incomplete, String(now - PROFILE_SETUP_REMINDER_MS + 1), now), false);
  assert.equal(shouldPromptForProfile(incomplete, String(now - PROFILE_SETUP_REMINDER_MS), now), true);
  assert.equal(shouldPromptForProfile(incomplete, 'invalid', now), true);
  assert.equal(shouldPromptForProfile(incomplete, String(now + 1), now), true);
  assert.equal(shouldPromptForProfile(complete, null, now), false);
  assert.match(source, /localStorage\.setItem\(PROFILE_SETUP_DISMISSED_KEY/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.match(source, /localStorage\.removeItem\(PROFILE_SETUP_DISMISSED_KEY\)/);
});

test('profile copy explains that personal data remains in the browser', () => {
  const settings = readFileSync(new URL('../src/settings/SettingsView.tsx', import.meta.url), 'utf8');
  const setup = readFileSync(new URL('../src/profile/ProfileSetupDialog.tsx', import.meta.url), 'utf8');
  assert.match(settings, /We don’t save your personal data, it stays in your own browser/);
  assert.match(setup, /We don’t save your personal data, it stays in your own browser/);
  assert.match(setup, /return after two hours/);
  assert.match(setup, />Not now</);
});
