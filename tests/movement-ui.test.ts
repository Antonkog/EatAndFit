import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const calendar = readFileSync(new URL('../src/calendar/CalendarView.tsx', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/movement/ExerciseSession.tsx', import.meta.url), 'utf8');
const reconciliation = readFileSync(new URL('../src/movement/countReconciliation.ts', import.meta.url), 'utf8');

test('Calendar exposes guided exercise only for incomplete workouts on the current day', () => {
  assert.match(calendar, /date === localDate\(\) && firstIncompleteSet >= 0/);
  assert.match(calendar, /> Start exercise</);
});

test('guided sessions separate local camera permission from explicit provider review', () => {
  assert.match(session, /Enable camera\?/);
  assert.match(session, /Video is not uploaded unless you later choose/);
  assert.match(session, /Send this muted set recording temporarily/);
  assert.match(session, /directly from this browser to \$\{providerName\}/);
  assert.match(session, /Analyze with AI/);
  assert.match(session, /MediaPipe counted/);
  assert.match(session, /AI observed/);
  assert.match(session, /Keep \{review\.baselineRepCount\} reps/);
  assert.match(session, /Use \{review\.suggestedSetRepCount\} reps/);
  assert.doesNotMatch(session, /Counted on this device/);
  assert.match(session, /Tracked with SAM 3\.1/);
  assert.match(session, /Reviewed by Muse Spark 1\.3/);
  assert.match(session, /storedAnalysis/);
  assert.match(session, /applyAcceptedMovementCount/);
  assert.match(reconciliation, /reps: acceptedRepCount/);
  assert.doesNotMatch(session, /Evidence: \{coaching\.evidenceMetric\}/);
  assert.doesNotMatch(session, /movementSummary: \{ \.\.\.set\.movementSummary, metaAnalysis: result \}/);
});

test('unsupported exercises can record a silent set for advisory AI review without MediaPipe', () => {
  assert.match(session, /Record set with AI/);
  assert.match(session, /Record with camera/);
  assert.match(session, /Recording set for AI/);
  assert.match(session, /elapsedSeconds < 90/);
  assert.match(session, /mode: profile \? 'profiled' : 'generic'/);
  assert.match(session, /plannedRepCount:/);
  assert.match(session, /\{profile && <canvas/);
});

test('voice cues are primed from a user action and expose a session control', () => {
  assert.match(session, /window\.speechSynthesis\.resume\(\)/);
  assert.match(session, /Sound cues enabled/);
  assert.match(session, /Test sound/);
  assert.match(session, /Turn off voice cues/);
  assert.match(session, /Voice cues are unavailable/);
});

