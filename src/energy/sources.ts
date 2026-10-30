import type { Exercise } from '../exercises/types';

export const ENERGY_SOURCE_REGISTRY_VERSION = '2024.1';

export type EnergyProfileId =
  | 'stretching'
  | 'core'
  | 'bodyweight_general'
  | 'bodyweight_vigorous'
  | 'squat_deadlift'
  | 'resistance_general'
  | 'resistance_vigorous'
  | 'circuit'
  | 'kettlebell';

export type SourceMatch = 'exact' | 'proxy' | 'derived';
export type EnergySource = {
  registryVersion: string;
  profileId: EnergyProfileId;
  sourceName: string;
  sourceUrl: string;
  activityCode: string;
  activityLabel: string;
  publishedValue: number;
  unit: 'MET' | 'MET60+' | 'METy';
  ageMin: number;
  ageMax: number;
  reuseTerms: string;
  match: SourceMatch;
};

type SourceTemplate = Omit<EnergySource, 'registryVersion' | 'profileId' | 'ageMin' | 'ageMax'>;

const adultUrl = 'https://pacompendium.com/conditioning-exercise/';
const olderUrl = 'https://pacompendium.com/older-adult-compendium/';
const youthUrl = 'https://www.nccor.org/tools-youthcompendium/met-view-by-individual-category/';
const compendiumTerms = 'Published reference values; attribution required. Compendium estimates are not individual physiological measurements.';

const adult: Record<EnergyProfileId, SourceTemplate> = {
  stretching: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02101', activityLabel: 'Mild stretching', publishedValue: 2.3, unit: 'MET', reuseTerms: compendiumTerms, match: 'exact' },
  core: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02022', activityLabel: 'Calisthenics, moderate effort', publishedValue: 3.8, unit: 'MET', reuseTerms: compendiumTerms, match: 'proxy' },
  bodyweight_general: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02056', activityLabel: 'Resistance training, body weight, general', publishedValue: 3, unit: 'MET', reuseTerms: compendiumTerms, match: 'exact' },
  bodyweight_vigorous: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02057', activityLabel: 'Resistance training, body weight, high intensity', publishedValue: 6.5, unit: 'MET', reuseTerms: compendiumTerms, match: 'exact' },
  squat_deadlift: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02052', activityLabel: 'Resistance training, squats and deadlift', publishedValue: 5, unit: 'MET', reuseTerms: compendiumTerms, match: 'exact' },
  resistance_general: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02054', activityLabel: 'Resistance training, multiple exercises, 8–15 repetitions', publishedValue: 3.5, unit: 'MET', reuseTerms: compendiumTerms, match: 'proxy' },
  resistance_vigorous: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02050', activityLabel: 'Resistance training, vigorous effort', publishedValue: 6, unit: 'MET', reuseTerms: compendiumTerms, match: 'proxy' },
  circuit: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02055', activityLabel: 'Resistance circuit training', publishedValue: 5.8, unit: 'MET', reuseTerms: compendiumTerms, match: 'exact' },
  kettlebell: { sourceName: '2024 Adult Compendium of Physical Activities', sourceUrl: adultUrl, activityCode: '02058', activityLabel: 'Kettlebell swings', publishedValue: 9.8, unit: 'MET', reuseTerms: compendiumTerms, match: 'exact' },
};

const older: Record<EnergyProfileId, SourceTemplate> = {
  stretching: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0219060', activityLabel: 'Yoga, general', publishedValue: 2.5, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  core: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0202260', activityLabel: 'Calisthenics, moderate effort', publishedValue: 3.5, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  bodyweight_general: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0205360', activityLabel: 'Resistance training, general, light effort', publishedValue: 2.3, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  bodyweight_vigorous: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0203560', activityLabel: 'Circuit training, moderate effort', publishedValue: 4.5, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  squat_deadlift: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0205160', activityLabel: 'Squats, light effort', publishedValue: 3, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  resistance_general: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0205460', activityLabel: 'Resistance training, multiple exercises, 8–15 repetitions', publishedValue: 4.3, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  resistance_vigorous: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0206260', activityLabel: 'Health club conditioning, general', publishedValue: 5, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
  circuit: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0203560', activityLabel: 'Circuit training, moderate effort', publishedValue: 4.5, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'exact' },
  kettlebell: { sourceName: 'Older Adult Compendium of Physical Activities', sourceUrl: olderUrl, activityCode: '0206260', activityLabel: 'Health club conditioning, general', publishedValue: 5, unit: 'MET60+', reuseTerms: compendiumTerms, match: 'proxy' },
};

const youthValues: Record<EnergyProfileId, { code: string; label: string; values: [number, number, number, number]; match: SourceMatch }> = {
  stretching: { code: '30200X', label: 'Calisthenics, light effort', values: [4, 4.1, 4.1, 4.2], match: 'proxy' },
  core: { code: '30280X', label: 'Curl-ups', values: [2.4, 2.4, 2.4, 2.4], match: 'proxy' },
  bodyweight_general: { code: '30300X', label: 'Push-ups', values: [3.9, 4, 4, 4.1], match: 'proxy' },
  bodyweight_vigorous: { code: '30300X', label: 'Push-ups', values: [3.9, 4, 4, 4.1], match: 'proxy' },
  squat_deadlift: { code: '85140X', label: 'Leg press', values: [2.6, 2.7, 2.7, 2.7], match: 'proxy' },
  resistance_general: { code: '85100X', label: 'Exercise with hand weights', values: [3, 3, 2.9, 2.9], match: 'proxy' },
  resistance_vigorous: { code: '85120X', label: 'Bench press', values: [2, 2, 1.9, 1.8], match: 'proxy' },
  circuit: { code: '30200X', label: 'Calisthenics, light effort', values: [4, 4.1, 4.1, 4.2], match: 'proxy' },
  kettlebell: { code: '85100X', label: 'Exercise with hand weights', values: [3, 3, 2.9, 2.9], match: 'proxy' },
};

export function classifyExercise(exercise: Pick<Exercise, 'name' | 'equipment' | 'difficulty' | 'compound' | 'target' | 'body_part'>): EnergyProfileId {
  const text = `${exercise.name} ${exercise.target} ${exercise.body_part}`.toLowerCase();
  const equipment = exercise.equipment.toLowerCase();
  if (/stretch|mobility|yoga/.test(text)) return 'stretching';
  if (/kettlebell.*swing|swing.*kettlebell/.test(`${text} ${equipment}`)) return 'kettlebell';
  if (/squat|deadlift/.test(text) && equipment !== 'body weight') return 'squat_deadlift';
  if (/crunch|sit-up|curl-up|plank|abdom|core/.test(text)) return 'core';
  if (/circuit/.test(text)) return 'circuit';
  if (equipment === 'body weight' || equipment === 'bodyweight' || /pull-up|chin-up|push-up|dip\b/.test(text)) {
    return exercise.difficulty === 'advanced' || (Boolean(exercise.compound) && exercise.difficulty !== 'beginner')
      ? 'bodyweight_vigorous'
      : 'bodyweight_general';
  }
  return Boolean(exercise.compound) && exercise.difficulty !== 'beginner' ? 'resistance_vigorous' : 'resistance_general';
}

function youthBand(age: number) {
  if (age <= 9) return { index: 0, min: 6, max: 9 } as const;
  if (age <= 12) return { index: 1, min: 10, max: 12 } as const;
  if (age <= 15) return { index: 2, min: 13, max: 15 } as const;
  return { index: 3, min: 16, max: 18 } as const;
}

export function resolveEnergySource(exercise: Exercise, age: number): EnergySource | undefined {
  if (!Number.isInteger(age) || age < 6 || age > 120) return undefined;
  const profileId = classifyExercise(exercise);
  if (age <= 18) {
    const band = youthBand(age);
    const source = youthValues[profileId];
    return validateEnergySource({
      registryVersion: ENERGY_SOURCE_REGISTRY_VERSION,
      profileId,
      sourceName: 'Youth Compendium of Physical Activities',
      sourceUrl: youthUrl,
      activityCode: source.code,
      activityLabel: source.label,
      publishedValue: source.values[band.index],
      unit: 'METy',
      ageMin: band.min,
      ageMax: band.max,
      reuseTerms: 'Publicly accessible research reference; cite the Youth Compendium and NCCOR source.',
      match: source.match,
    }, age);
  }
  const template = age >= 60 ? older[profileId] : adult[profileId];
  return validateEnergySource({ ...template, registryVersion: ENERGY_SOURCE_REGISTRY_VERSION, profileId, ageMin: age >= 60 ? 60 : 19, ageMax: age >= 60 ? 120 : 59 }, age);
}

export function validateEnergySource(source: EnergySource, age: number) {
  if (!source.sourceName || !/^https:\/\//.test(source.sourceUrl) || !source.activityCode || !source.reuseTerms) throw new Error('Energy source provenance is incomplete.');
  if (!Number.isFinite(source.publishedValue) || source.publishedValue <= 0) throw new Error('Energy source value must be a positive published number.');
  if (!['MET', 'MET60+', 'METy'].includes(source.unit)) throw new Error('Energy source unit is not supported.');
  if (age < source.ageMin || age > source.ageMax) throw new Error('Energy source is incompatible with this age.');
  if (age <= 18 && source.unit !== 'METy') throw new Error('Youth estimates require METy values.');
  if (age >= 19 && age <= 59 && source.unit !== 'MET') throw new Error('Adult estimates require MET values.');
  if (age >= 60 && source.unit !== 'MET60+') throw new Error('Older-adult estimates require MET60+ values.');
  return source;
}

export function sourceRegistryEntries() {
  return [
    ...Object.entries(adult).map(([profileId, value]) => ({ ...value, registryVersion: ENERGY_SOURCE_REGISTRY_VERSION, profileId, ageMin: 19, ageMax: 59 })),
    ...Object.entries(older).map(([profileId, value]) => ({ ...value, registryVersion: ENERGY_SOURCE_REGISTRY_VERSION, profileId, ageMin: 60, ageMax: 120 })),
  ];
}
