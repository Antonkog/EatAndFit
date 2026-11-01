import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAssessment, validateCoaching, validateMovementFields, validateMuseReview } from '../server/movement-provider.mjs';

const evidence = [{ metric: 'primary_range', label: 'Lowest knee angle', value: 101, unit: 'degrees', target: '110° or lower' }];
const requestFields = {
  exerciseId: 'freeexercise:drv-squat', exerciseName: 'Squat', movementGuidance: 'Lowest knee angle', setNumber: '1', selectedRep: '2', repStartMs: '1000', repEndMs: '3400', adultConfirmed: 'true',
  localRepCount: '3', priorRepCount: '0', activeDurationMs: '15000', repWindows: JSON.stringify([{ index: 1, startMs: 1000, endMs: 2200, confidence: 0.9 }]),
};

test('movement request validation preserves the authoritative local assessment', () => {
  const value = validateMovementFields({
    ...requestFields,
    assessment: JSON.stringify({ status: 'good_form', evidence }),
  });
  assert.equal(value.assessment.status, 'good_form');
  assert.equal(value.startMs, 1000);
  assert.equal(value.endMs, 3400);
});

test('movement request validation rejects invalid windows and non-adult requests', () => {
  assert.throws(() => validateMovementFields({ ...requestFields, repEndMs: '1200', assessment: JSON.stringify({ status: 'good_form', evidence }) }), /0.8 and 12 seconds/);
  assert.throws(() => validateMovementFields({ ...requestFields, adultConfirmed: 'false', assessment: JSON.stringify({ status: 'good_form', evidence }) }), /confirmed adults/);
});

test('Muse full-set review returns a separate count without changing local assessment', () => {
  const assessment = validateAssessment({ status: 'good_form', evidence });
  const result = validateMuseReview({
    status: 'good_form', positiveObservation: 'Controlled range.', primaryCorrection: null, nextSetGoal: 'Repeat it.', evidenceMetric: 'Lowest knee angle: 101 degrees',
    observedRepCount: 4, countConfidence: 'medium',
  }, assessment);
  assert.equal(result.observedRepCount, 4);
  assert.equal(result.countConfidence, 'medium');
  assert.equal(result.coaching.status, 'good_form');
  assert.throws(() => validateMuseReview({
    status: 'good_form', positiveObservation: 'Controlled range.', primaryCorrection: null, nextSetGoal: null, evidenceMetric: null,
    observedRepCount: 2.5, countConfidence: 'high',
  }, assessment), /invalid repetition count/);
});

test('Muse cannot invent a correction for application-selected good form', () => {
  const assessment = validateAssessment({ status: 'good_form', evidence });
  assert.throws(() => validateCoaching({ status: 'correction_needed', positiveObservation: null, primaryCorrection: 'Go deeper.', nextSetGoal: null, evidenceMetric: 'Lowest knee angle' }, assessment), /contradicted/);
  assert.throws(() => validateCoaching({ status: 'good_form', positiveObservation: 'Stable cadence.', primaryCorrection: 'Go deeper.', nextSetGoal: null, evidenceMetric: null }, assessment), /invented a correction/);
  const result = validateCoaching({ status: 'good_form', positiveObservation: 'Your measured depth and cadence were consistent.', primaryCorrection: null, nextSetGoal: 'Repeat the same controlled range.', evidenceMetric: 'Lowest knee angle: 101 degrees' }, assessment);
  assert.equal(result.primaryCorrection, null);
});

test('Muse must return one evidence-based correction and no judgment for insufficient evidence', () => {
  const correction = validateAssessment({ status: 'correction_needed', issue: 'range_of_motion', evidence });
  assert.throws(() => validateCoaching({ status: 'correction_needed', positiveObservation: null, primaryCorrection: 'Go deeper.', nextSetGoal: null, evidenceMetric: null }, correction), /evidence-based correction/);
  assert.throws(() => validateCoaching({ status: 'correction_needed', positiveObservation: null, primaryCorrection: 'Go deeper.', nextSetGoal: null, evidenceMetric: 'Back position' }, correction), /did not supply/);
  const insufficient = validateAssessment({ status: 'insufficient_evidence', reason: 'low_visibility', evidence });
  assert.throws(() => validateCoaching({ status: 'insufficient_evidence', positiveObservation: 'Looks good.', primaryCorrection: null, nextSetGoal: 'Move back.', evidenceMetric: null }, insufficient), /without sufficient evidence/);
});

