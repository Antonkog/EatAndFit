import assert from 'node:assert/strict';
import test from 'node:test';
import { MovementTracker, selectRepresentativeRep } from '../src/movement/engine';
import { movementProfileForExercise, movementProfiles } from '../src/movement/profiles';
import type { PoseLandmark } from '../src/movement/types';

function squatPose(kneeAngle: number, visibility = 1) {
  const points: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
  const radians = kneeAngle * Math.PI / 180;
  points[23] = { x: 0.5, y: 0.3, z: 0, visibility };
  points[25] = { x: 0.5, y: 0.5, z: 0, visibility };
  points[27] = { x: 0.5 + Math.sin(radians) * 0.2, y: 0.5 - Math.cos(radians) * 0.2, z: 0, visibility };
  return points;
}

function runSquat(bottomAngle: number, visibility = 1) {
  const profile = movementProfileForExercise('freeexercise:drv-squat')!;
  const tracker = new MovementTracker(profile);
  let timestampMs = 0;
  for (const angle of [...Array(5).fill(170), ...Array(5).fill(bottomAngle), ...Array(6).fill(170)]) {
    tracker.process({ timestampMs, landmarks: squatPose(angle, visibility) });
    timestampMs += 100;
  }
  return tracker;
}

test('the initial movement catalog covers the five gym lifts and three home exercises', () => {
  assert.equal(movementProfiles.length, 8);
  for (const id of [
    'freeexercise:1435', 'freeexercise:0300', 'freeexercise:0025', 'freeexercise:drv-chin-ups-pull-ups',
    'freeexercise:0553', 'freeexercise:drv-squat', 'freeexercise:drv-push-ups', 'freeexercise:new-low-impact-jumping-jack',
  ]) assert.ok(movementProfileForExercise(id), `${id} should have a movement profile`);
});

test('a full bodyweight squat is counted and classified as good form without a correction', () => {
  const tracker = runSquat(100);
  assert.equal(tracker.reps.length, 1);
  assert.equal(tracker.reps[0].assessment.status, 'good_form');
  assert.ok(!('issue' in tracker.reps[0].assessment));
});

test('a shallow but countable squat produces exactly one local correction state', () => {
  const tracker = runSquat(118);
  assert.equal(tracker.reps.length, 1);
  assert.equal(tracker.reps[0].assessment.status, 'correction_needed');
  assert.equal(tracker.reps[0].assessment.evidence[0].metric, 'primary_range');
});

test('borderline tracking can count a rep but does not make a technique judgment', () => {
  const tracker = runSquat(100, 0.61);
  assert.equal(tracker.reps.length, 1);
  assert.equal(tracker.reps[0].assessment.status, 'insufficient_evidence');
});

test('representative selection prioritizes a supported issue over a good rep', () => {
  const good = runSquat(100).reps[0];
  const correction = { ...runSquat(118).reps[0], index: 2 };
  assert.equal(selectRepresentativeRep([good, correction])?.index, 2);
});

