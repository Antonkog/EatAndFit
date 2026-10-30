import type { WorkoutSet } from '../data/db';
import type { Exercise } from '../exercises/types';
import type { ProfileSex, UserProfile } from '../profile/userProfile';
import { resolveEnergySource, type EnergyProfileId, type EnergySource } from './sources';

export type EstimateConfidence = 'Direct source' | 'Closest activity' | 'Derived estimate' | 'AI-personalized estimate';
export type EnergyEstimate = {
  calories: number;
  baseCalories: number;
  durationMinutes: number;
  equivalentKg: number;
  confidence: EstimateConfidence;
  source: EnergySource;
  calibrationFactor?: number;
};

const restSeconds: Record<EnergyProfileId, number> = {
  stretching: 30,
  core: 30,
  bodyweight_general: 45,
  bodyweight_vigorous: 60,
  squat_deadlift: 90,
  resistance_general: 60,
  resistance_vigorous: 90,
  circuit: 30,
  kettlebell: 60,
};

const activeSecondsPerRep: Record<EnergyProfileId, number> = {
  stretching: 5,
  core: 4,
  bodyweight_general: 4,
  bodyweight_vigorous: 5,
  squat_deadlift: 6,
  resistance_general: 4,
  resistance_vigorous: 5,
  circuit: 4,
  kettlebell: 5,
};

export function estimateSetDurationSeconds(reps: number, profileId: EnergyProfileId) {
  return Math.max(30, Math.round(Math.max(0, reps) * activeSecondsPerRep[profileId]));
}

export function schofieldBmrKcalPerMinute(age: number, sex: ProfileSex, weightKg: number) {
  if (age < 6 || age > 18 || weightKg <= 0) return undefined;
  if (sex === 'male') return (age <= 9 ? 22.706 * weightKg + 504.3 : 17.686 * weightKg + 658.2) / 1440;
  return (age <= 9 ? 20.315 * weightKg + 485.9 : 13.384 * weightKg + 692.6) / 1440;
}

export function estimateDurationSeconds(sets: Array<Pick<WorkoutSet, 'reps' | 'durationSeconds'>>, profileId: EnergyProfileId) {
  if (sets.length === 0) return 0;
  const active = sets.reduce((total, set) => total + (set.durationSeconds && set.durationSeconds > 0 ? set.durationSeconds : estimateSetDurationSeconds(set.reps, profileId)), 0);
  return active + Math.max(0, sets.length - 1) * restSeconds[profileId];
}

export function compendiumCalories(value: number, weightKg: number, minutes: number, olderAdult = false) {
  return value * (olderAdult ? 2.7 : 3.5) * weightKg / 200 * minutes;
}

export function youthCalories(mety: number, bmrKcalPerMinute: number, minutes: number) {
  return mety * bmrKcalPerMinute * minutes;
}

const harvardWeightsKg = [125, 155, 185].map((pounds) => pounds * 0.45359237);
export const HARVARD_30_MINUTE_VALUES = {
  general_weight_training: [90, 108, 126],
  vigorous_weight_training: [180, 216, 252],
  moderate_calisthenics: [135, 162, 189],
  vigorous_calisthenics: [240, 306, 336],
  stretching_hatha: [120, 144, 168],
} as const;

export function harvardCalories(activity: keyof typeof HARVARD_30_MINUTE_VALUES, weightKg: number, minutes: number) {
  const values = HARVARD_30_MINUTE_VALUES[activity];
  let value: number;
  if (weightKg <= harvardWeightsKg[0]) {
    value = values[0] * weightKg / harvardWeightsKg[0];
  } else if (weightKg >= harvardWeightsKg[2]) {
    value = values[2] * weightKg / harvardWeightsKg[2];
  } else {
    const highIndex = weightKg <= harvardWeightsKg[1] ? 1 : 2;
    const lowIndex = highIndex - 1;
    const ratio = (weightKg - harvardWeightsKg[lowIndex]) / (harvardWeightsKg[highIndex] - harvardWeightsKg[lowIndex]);
    value = values[lowIndex] + ratio * (values[highIndex] - values[lowIndex]);
  }
  return value * minutes / 30;
}

export function estimateExerciseEnergy(
  exercise: Exercise,
  sets: Array<Pick<WorkoutSet, 'reps' | 'durationSeconds'>>,
  profile: UserProfile,
  calibrationFactor?: number,
): EnergyEstimate | undefined {
  if (!profile.age || !profile.sex || !profile.weightKg || profile.age < 6) return undefined;
  const source = resolveEnergySource(exercise, profile.age);
  if (!source) return undefined;
  const durationMinutes = estimateDurationSeconds(sets, source.profileId) / 60;
  let baseCalories: number;
  if (source.unit === 'METy') {
    const bmr = schofieldBmrKcalPerMinute(profile.age, profile.sex, profile.weightKg);
    if (!bmr) return undefined;
    baseCalories = youthCalories(source.publishedValue, bmr, durationMinutes);
  } else {
    baseCalories = compendiumCalories(source.publishedValue, profile.weightKg, durationMinutes, source.unit === 'MET60+');
  }
  const allowedFactor = profile.age >= 19 && calibrationFactor && calibrationFactor >= 0.5 && calibrationFactor <= 1.5 ? calibrationFactor : undefined;
  const calories = baseCalories * (allowedFactor ?? 1);
  const confidence: EstimateConfidence = allowedFactor
    ? 'AI-personalized estimate'
    : source.match === 'exact' ? 'Direct source' : source.match === 'proxy' ? 'Closest activity' : 'Derived estimate';
  return {
    calories,
    baseCalories,
    durationMinutes,
    equivalentKg: calories / 7700,
    confidence,
    source,
    ...(allowedFactor ? { calibrationFactor: allowedFactor } : {}),
  };
}

export function energySourceLabel(estimate: EnergyEstimate) {
  return `${estimate.confidence} · ${estimate.source.sourceName} ${estimate.source.activityCode}`;
}
