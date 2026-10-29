export type ProfileSex = 'male' | 'female';

export type UserProfile = {
  sex?: ProfileSex;
  weightKg?: number;
  heightCm?: number;
};

export const PROFILE_CHANGED = 'eatfit-profile-change';
const PROFILE_STORAGE_KEY = 'eat-and-fit:user-profile';
const PROFILE_SETUP_SESSION_KEY = 'eat-and-fit:profile-setup-skipped';
const EXERCISE_MODEL_STORAGE_KEY = 'eat-and-fit-white:exercise-model';

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeUserProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const sex = candidate.sex === 'male' || candidate.sex === 'female' ? candidate.sex : undefined;
  const weightKg = finiteNumber(candidate.weightKg);
  const heightCm = finiteNumber(candidate.heightCm);
  return {
    ...(sex ? { sex } : {}),
    ...(weightKg && weightKg >= 20 && weightKg <= 400 ? { weightKg } : {}),
    ...(heightCm && heightCm >= 80 && heightCm <= 250 ? { heightCm } : {}),
  };
}

export function profileIssue(profile: UserProfile) {
  if (profile.sex !== 'male' && profile.sex !== 'female') return 'Select male or female.';
  if (!Number.isFinite(profile.weightKg) || Number(profile.weightKg) < 20 || Number(profile.weightKg) > 400) return 'Enter a weight between 20 and 400 kg.';
  if (!Number.isFinite(profile.heightCm) || Number(profile.heightCm) < 80 || Number(profile.heightCm) > 250) return 'Enter a height between 80 and 250 cm.';
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
  if (normalized.sex) localStorage.setItem(EXERCISE_MODEL_STORAGE_KEY, normalized.sex);
  window.dispatchEvent(new Event(PROFILE_CHANGED));
  return normalized;
}

export function shouldShowProfileSetup() {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(PROFILE_SETUP_SESSION_KEY) !== 'true' && Boolean(profileIssue(readUserProfile()));
}

export function dismissProfileSetup() {
  sessionStorage.setItem(PROFILE_SETUP_SESSION_KEY, 'true');
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
