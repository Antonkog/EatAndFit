import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const provider = readFileSync(new URL('../src/movement/metaAnalysis.ts', import.meta.url), 'utf8');

test('movement review defines separate Meta and Gemini adapters without provider fallback', () => {
  assert.match(provider, /interface MovementReviewProvider/);
  assert.match(provider, /class MetaMovementReviewProvider implements MovementReviewProvider/);
  assert.match(provider, /class GeminiMovementReviewProvider implements MovementReviewProvider/);
  assert.match(provider, /provider === 'META' && META_API_ENABLED/);
  assert.match(provider, /provider === 'GEMINI' && GEMINI_API_ENABLED/);
  assert.match(provider, /GEMINI_MOVEMENT_MODEL is not configured/);
  assert.doesNotMatch(provider, /catch[\s\S]{0,240}GeminiMovementReviewProvider/);
});

test('generic movement reviews use planned reps and prohibit fabricated local measurements', () => {
  assert.match(provider, /fields\.mode === 'generic'/);
  assert.match(provider, /baselineKind: fields\.mode === 'generic' \? 'planned' : 'mediapipe'/);
  assert.match(provider, /do not claim joint angles, range-of-motion measurements, numerical scores, medical conclusions/);
  assert.match(provider, /status ai_observation/);
});
