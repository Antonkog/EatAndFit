import assert from 'node:assert/strict';
import test from 'node:test';
import { movementProfiles } from '../src/movement/profiles';
import { evaluatePoseReadiness, nextReadinessFrameCount } from '../src/movement/readiness';
import type { PoseLandmark } from '../src/movement/types';

function landmarksWithVisibility(entries: Array<[number, number]>) {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  for (const [index, visibility] of entries) landmarks[index].visibility = visibility;
  return landmarks;
}

const leftSquatSide: Array<[number, number]> = [[11, 0.45], [23, 0.45], [25, 0.45], [27, 0.45]];
const rightSquatSide: Array<[number, number]> = [[12, 0.45], [24, 0.45], [26, 0.45], [28, 0.45]];
const defaultBilateral: Array<[number, number]> = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28].map((index) => [index, 0.6]);

test('bodyweight squat accepts either complete shoulder-hip-knee-ankle side', () => {
  const left = evaluatePoseReadiness('bodyweight-squat', landmarksWithVisibility(leftSquatSide));
  const right = evaluatePoseReadiness('bodyweight-squat', landmarksWithVisibility(rightSquatSide));
  assert.equal(left.landmarksVisible, true);
  assert.equal(right.landmarksVisible, true);
  assert.equal(left.requiredConsecutiveFrames, 5);
  assert.equal(right.requiredConsecutiveFrames, 5);
});

test('bodyweight squat rejects a missing or low-confidence knee or ankle', () => {
  assert.equal(evaluatePoseReadiness('bodyweight-squat', landmarksWithVisibility(leftSquatSide.filter(([index]) => index !== 25))).landmarksVisible, false);
  assert.equal(evaluatePoseReadiness('bodyweight-squat', landmarksWithVisibility(leftSquatSide.map(([index, visibility]) => [index, index === 27 ? 0.44 : visibility]))).landmarksVisible, false);
});

test('bodyweight squat requires five consecutive frames and resets after an invalid frame', () => {
  let stableFrames = 0;
  for (let frame = 0; frame < 4; frame += 1) stableFrames = nextReadinessFrameCount(stableFrames, true);
  assert.equal(stableFrames, 4);
  stableFrames = nextReadinessFrameCount(stableFrames, false);
  assert.equal(stableFrames, 0);
  for (let frame = 0; frame < 5; frame += 1) stableFrames = nextReadinessFrameCount(stableFrames, true);
  assert.equal(stableFrames, 5);
});

test('all other movement profiles retain bilateral 60 percent visibility for ten frames', () => {
  for (const profile of movementProfiles.filter(({ id }) => id !== 'bodyweight-squat')) {
    const ready = evaluatePoseReadiness(profile.id, landmarksWithVisibility(defaultBilateral));
    assert.equal(ready.landmarksVisible, true, profile.id);
    assert.equal(ready.requiredConsecutiveFrames, 10, profile.id);
    const oneLowLandmark = evaluatePoseReadiness(profile.id, landmarksWithVisibility(defaultBilateral.map(([index, visibility]) => [index, index === 16 ? 0.59 : visibility])));
    assert.equal(oneLowLandmark.landmarksVisible, false, profile.id);
  }
});
