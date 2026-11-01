import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraSetIsComplete, cameraSetProgress, resolveCameraSetTarget } from '../src/movement/setTarget';

test('rep-based camera sets continue after each rep until the configured set target', () => {
  const target = resolveCameraSetTarget({ reps: 10, durationSeconds: 40 });
  assert.equal(cameraSetIsComplete(target, 1, 40), false);
  assert.equal(cameraSetIsComplete(target, 9, 80), false);
  assert.equal(cameraSetIsComplete(target, 10, 20), true);
  assert.equal(cameraSetProgress(target, 1, 5), 10);
});

test('time-based camera sets count reps but finish only when the set duration ends', () => {
  const target = resolveCameraSetTarget({ reps: 0, durationSeconds: 60 });
  assert.equal(target.targetReps, 0);
  assert.equal(cameraSetIsComplete(target, 20, 59), false);
  assert.equal(cameraSetIsComplete(target, 20, 60), true);
  assert.equal(cameraSetProgress(target, 20, 30), 50);
});

test('an empty camera set receives a safe thirty-second time target instead of one rep', () => {
  const target = resolveCameraSetTarget({ reps: 0, durationSeconds: 0 });
  assert.deepEqual(target, { targetReps: 0, targetSeconds: 30 });
  assert.equal(cameraSetIsComplete(target, 1, 1), false);
});
