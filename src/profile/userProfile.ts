export type ProfileSex = 'male' | 'female';
export type TrainingGoal = 'lose_weight' | 'build_muscle' | 'stay_fit';

export type UserProfile = {
  sex?: ProfileSex;
  age?: number;
  weightKg?: number;
  heightCm?: number;
  trainingGoal?: TrainingGoal;
};

export const PROFILE_CHANGED = 'eatfit-profile-change';
const PROFILE_STORAGE_KEY = 'eat-and-fit:user-profile';
const PROFILE_SETUP_DISMISSED_KEY = 'eat-and-fit:profile-setup-dismissed-at';
const EXERCISE_MODEL_STORAGE_KEY = 'eat-and-fit-white:exercise-model';
export const PROFILE_SETUP_REMINDER_MS = 2 * 60 * 60 * 1000;

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeUserProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const sex = candidate.sex === 'male' || candidate.sex === 'female' ? candidate.sex : undefined;
  const age = finiteNumber(candidate.age);
  const weightKg = finiteNumber(candidate.weightKg);
  const heightCm = finiteNumber(candidate.heightCm);
  const trainingGoal = candidate.trainingGoal === 'lose_weight' || candidate.trainingGoal === 'build_muscle' || candidate.trainingGoal === 'stay_fit'
    ? candidate.trainingGoal
    : undefined;
  return {
    ...(sex ? { sex } : {}),
    ...(age && Number.isInteger(age) && age >= 1 && age <= 120 ? { age } : {}),
    ...(weightKg && weightKg >= 2 && weightKg <= 400 ? { weightKg } : {}),
    ...(heightCm && heightCm >= 40 && heightCm <= 250 ? { heightCm } : {}),
    ...(age && age >= 19 && trainingGoal ? { trainingGoal } : {}),
  };
}

export function profileIssue(profile: UserProfile) {
  if (profile.sex !== 'male' && profile.sex !== 'female') return 'Select male or female.';
  if (!Number.isInteger(profile.age) || Number(profile.age) < 1 || Number(profile.age) > 120) return 'Enter an age between 1 and 120.';
  if (!Number.isFinite(profile.weightKg) || Number(profile.weightKg) < 2 || Number(profile.weightKg) > 400) return 'Enter a weight between 2 and 400 kg.';
  if (!Number.isFinite(profile.heightCm) || Number(profile.heightCm) < 40 || Number(profile.heightCm) > 250) return 'Enter a height between 40 and 250 cm.';
  if (Number(profile.age) >= 19 && profile.trainingGoal !== 'lose_weight' && profile.trainingGoal !== 'build_muscle' && profile.trainingGoal !== 'stay_fit') return 'Select a training goal.';
  return '';
}

export function readUserProfile(): UserProfile {
  if (typeof localStorage === 'undefined') return {};
  try {
    return normalizeUserProfile(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

export function saveUserProfile(profile: UserProfile) {
  const issue = profileIssue(profile);
  if (issue) throw new Error(issue);
  const normalized = normalizeUserProfile(profile);
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.removeItem(PROFILE_SETUP_DISMISSED_KEY);
  if (normalized.sex) localStorage.setItem(EXERCISE_MODEL_STORAGE_KEY, normalized.sex);
  window.dispatchEvent(new Event(PROFILE_CHANGED));
  return normalized;
}

export function shouldPromptForProfile(profile: UserProfile, dismissedAt: string | null, now = Date.now()) {
  if (!profileIssue(profile)) return false;
  if (!dismissedAt) return true;
  const timestamp = Number(dismissedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) return true;
  return now - timestamp >= PROFILE_SETUP_REMINDER_MS;
}

export function shouldShowProfileSetup(now = Date.now()) {
  if (typeof localStorage === 'undefined') return false;
  return shouldPromptForProfile(readUserProfile(), localStorage.getItem(PROFILE_SETUP_DISMISSED_KEY), now);
}

export function dismissProfileSetup(now = Date.now()) {
  localStorage.setItem(PROFILE_SETUP_DISMISSED_KEY, String(now));
}

export function preferredExerciseSex(): ProfileSex {
  if (typeof localStorage === 'undefined') return 'female';
  const preference = localStorage.getItem(EXERCISE_MODEL_STORAGE_KEY);
  if (preference === 'male' || preference === 'female') return preference;
  return readUserProfile().sex ?? 'female';
}

export function setExerciseModelPreference(sex: ProfileSex) {
  localStorage.setItem(EXERCISE_MODEL_STORAGE_KEY, sex);
}
