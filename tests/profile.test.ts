import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeUserProfile, profileIssue } from '../src/profile/userProfile';

test('profile validation accepts supported sex and realistic metric values', () => {
  assert.equal(profileIssue({ sex: 'female', weightKg: 62.5, heightCm: 168 }), '');
  assert.equal(profileIssue({ sex: 'male', weightKg: 84, heightCm: 184 }), '');
  assert.match(profileIssue({ weightKg: 84, heightCm: 184 }), /male or female/);
  assert.match(profileIssue({ sex: 'male', weightKg: 0, heightCm: 184 }), /weight/);
  assert.match(profileIssue({ sex: 'female', weightKg: 62, heightCm: 400 }), /height/);
});

test('stored profiles discard unsupported or out-of-range fields', () => {
  assert.deepEqual(normalizeUserProfile({ sex: 'male', weightKg: 80, heightCm: 180 }), { sex: 'male', weightKg: 80, heightCm: 180 });
  assert.deepEqual(normalizeUserProfile({ sex: 'other', weightKg: -2, heightCm: 'wrong' }), {});
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

test('skipping profile setup lasts only for the current browser session', () => {
  const source = readFileSync(new URL('../src/profile/userProfile.ts', import.meta.url), 'utf8');
  assert.match(source, /sessionStorage\.setItem\(PROFILE_SETUP_SESSION_KEY/);
  assert.doesNotMatch(source, /localStorage\.setItem\(PROFILE_SETUP_SESSION_KEY/);
});
