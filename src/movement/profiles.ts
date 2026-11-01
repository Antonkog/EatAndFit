import type { MovementProfile } from './types';

export const movementProfiles: MovementProfile[] = [
  {
    id: 'bodyweight-squat',
    version: 1,
    exerciseIds: ['freeexercise:drv-squat'],
    displayName: 'Squat',
    cameraView: 'side',
    setupInstruction: 'Place your phone to the side so your shoulders, hips, knees, and feet remain visible.',
    countMetricLabel: 'Lowest knee angle',
    countUnit: 'degrees',
    goodFormTarget: '110° or lower',
  },
  {
    id: 'barbell-back-squat',
    version: 1,
    exerciseIds: ['freeexercise:1435'],
    displayName: 'Barbell Back Squat',
    cameraView: 'side',
    setupInstruction: 'Place your phone to the side so your shoulders, hips, knees, feet, and bar path remain visible.',
    countMetricLabel: 'Lowest knee angle',
    countUnit: 'degrees',
    goodFormTarget: '110° or lower',
  },
  {
    id: 'dumbbell-deadlift',
    version: 1,
    exerciseIds: ['freeexercise:0300'],
    displayName: 'Dumbbell Deadlift',
    cameraView: 'side',
    setupInstruction: 'Use a side view with your shoulders, hips, knees, and ankles visible.',
    countMetricLabel: 'Lowest hip angle',
    countUnit: 'degrees',
    goodFormTarget: '110° or lower',
  },
  {
    id: 'barbell-bench-press',
    version: 1,
    exerciseIds: ['freeexercise:0025'],
    displayName: 'Barbell Bench Press',
    cameraView: 'side',
    setupInstruction: 'Use a side view that keeps both shoulders, elbows, wrists, and the bar visible.',
    countMetricLabel: 'Lowest elbow angle',
    countUnit: 'degrees',
    goodFormTarget: '100° or lower',
  },
  {
    id: 'pull-up',
    version: 1,
    exerciseIds: ['freeexercise:drv-chin-ups-pull-ups'],
    displayName: 'Pull-Up / Chin-Up',
    cameraView: 'front',
    setupInstruction: 'Use a front view with your hands, shoulders, elbows, hips, and feet visible.',
    countMetricLabel: 'Smallest elbow angle',
    countUnit: 'degrees',
    goodFormTarget: '90° or lower',
  },
  {
    id: 'military-press',
    version: 1,
    exerciseIds: ['freeexercise:0553'],
    displayName: 'Military Press',
    cameraView: 'front',
    setupInstruction: 'Use a front view with both hands, shoulders, elbows, hips, and feet visible.',
    countMetricLabel: 'Largest elbow angle',
    countUnit: 'degrees',
    goodFormTarget: '155° or higher',
  },
  {
    id: 'push-up',
    version: 1,
    exerciseIds: ['freeexercise:drv-push-ups'],
    displayName: 'Push-Up',
    cameraView: 'side',
    setupInstruction: 'Place your phone low and to the side so your shoulders, hips, knees, and ankles remain visible.',
    countMetricLabel: 'Lowest elbow angle',
    countUnit: 'degrees',
    goodFormTarget: '100° or lower',
  },
  {
    id: 'jumping-jack',
    version: 1,
    exerciseIds: ['freeexercise:new-low-impact-jumping-jack'],
    displayName: 'Jumping Jack',
    cameraView: 'front',
    setupInstruction: 'Use a front view with your full body visible and enough space above your hands and beside your feet.',
    countMetricLabel: 'Maximum stance width',
    countUnit: 'ratio',
    goodFormTarget: '1.8× shoulder width or wider',
  },
];

const profileByExercise = new Map(movementProfiles.flatMap((profile) => profile.exerciseIds.map((id) => [id, profile])));

export function movementProfileForExercise(exerciseId: string) {
  return profileByExercise.get(exerciseId);
}

