import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isEdgeBackSwipe } from '../src/navigation/backNavigation';

test('a deliberate right swipe from the left edge is accepted', () => {
  assert.equal(isEdgeBackSwipe({ startX: 8, startY: 240, endX: 118, endY: 252, elapsedMs: 420, viewportWidth: 390 }), true);
});

test('short, vertical, slow, and non-edge gestures are rejected', () => {
  assert.equal(isEdgeBackSwipe({ startX: 8, startY: 240, endX: 60, endY: 240, elapsedMs: 300, viewportWidth: 390 }), false);
  assert.equal(isEdgeBackSwipe({ startX: 8, startY: 240, endX: 100, endY: 340, elapsedMs: 300, viewportWidth: 390 }), false);
  assert.equal(isEdgeBackSwipe({ startX: 8, startY: 240, endX: 120, endY: 240, elapsedMs: 1_200, viewportWidth: 390 }), false);
  assert.equal(isEdgeBackSwipe({ startX: 60, startY: 240, endX: 180, endY: 240, elapsedMs: 300, viewportWidth: 390 }), false);
});

test('back navigation prioritizes open details before primary-screen history', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const exercise = readFileSync(new URL('../src/exercises/ExerciseLibrary.tsx', import.meta.url), 'utf8');
  const movement = readFileSync(new URL('../src/movement/ExerciseSession.tsx', import.meta.url), 'utf8');
  assert.match(app, /useBackNavigation\(backDepth > 0, navigateBack, 10\)/);
  assert.match(exercise, /useBackNavigation\(true, onClose, 100\)/);
  assert.match(movement, /useBackNavigation\(true, \(\) => \{ releaseSession\(\); onClose\(\); \}, 150\)/);
});
