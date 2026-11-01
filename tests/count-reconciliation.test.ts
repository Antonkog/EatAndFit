import assert from 'node:assert/strict';
import test from 'node:test';
import type { Workout } from '../src/data/db';
import { applyAcceptedMovementCount } from '../src/movement/countReconciliation';
import type { StoredMetaMovementAnalysis } from '../src/movement/types';

const metaAnalysis: StoredMetaMovementAnalysis = {
  samModel: 'sam-3.1',
  trackingCoverage: 1,
  trackingConfidence: 0.95,
  localRepCount: 4,
  observedRepCount: 7,
  suggestedSetRepCount: 7,
  countConfidence: 'high',
  countDecision: 'muse',
  acceptedRepCount: 7,
  coaching: {
    status: 'good_form',
    positiveObservation: 'Controlled movement.',
    primaryCorrection: null,
    nextSetGoal: null,
    evidenceMetric: null,
  },
  museModel: 'muse-spark-1.3',
  processedAt: '2026-11-01T00:00:00.000Z',
};

function workout(): Workout {
  return {
    id: 'workout',
    date: '2026-11-01',
    exerciseId: 'bodyweight-squat',
    exerciseName: 'Bodyweight Squat',
    notes: '',
    completed: true,
    caloriesBurned: 20,
    calorieSource: 'Adult Compendium',
    calorieSourceUrl: 'https://pacompendium.com/',
    energyDurationMinutes: 2,
    energyEquivalentKg: 0.003,
    sets: [{
      id: 'set-1',
      reps: 4,
      weightKg: 0,
      complete: true,
      completedReps: 4,
      movementSummary: {
        profileId: 'bodyweight-squat',
        profileVersion: 1,
        mode: 'camera',
        completedReps: 4,
        elapsedSeconds: 12,
        reps: [],
      },
    }],
  };
}

test('accepting the Muse count updates the visible and completed Calendar repetitions', () => {
  const result = applyAcceptedMovementCount(workout(), 'set-1', 7, metaAnalysis);
  assert.equal(result.sets[0].reps, 7);
  assert.equal(result.sets[0].completedReps, 7);
  assert.equal(result.sets[0].movementSummary?.completedReps, 7);
  assert.equal(result.sets[0].movementSummary?.metaAnalysis?.acceptedRepCount, 7);
  assert.equal(result.sets[0].movementSummary?.metaAnalysis?.countDecision, 'muse');
});

test('changing an accepted count clears frozen energy so Calendar recalculates it', () => {
  const result = applyAcceptedMovementCount(workout(), 'set-1', 7, metaAnalysis);
  assert.equal(result.completed, false);
  assert.equal(result.caloriesBurned, undefined);
  assert.equal(result.calorieSource, undefined);
  assert.equal(result.energyDurationMinutes, undefined);
});
