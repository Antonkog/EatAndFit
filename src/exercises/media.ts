import type { ProfileSex } from '../profile/userProfile';
import type { Exercise } from './types';

export function exerciseMediaFor(exercise: Exercise, sex: ProfileSex) {
  const fallbackSex: ProfileSex = sex === 'male' ? 'female' : 'male';
  return {
    video: exercise.media.video?.[sex] ?? exercise.media.video?.[fallbackSex],
    thumbnail: exercise.media.thumbnail?.[sex] ?? exercise.media.thumbnail?.[fallbackSex],
  };
}
