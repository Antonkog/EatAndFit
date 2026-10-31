import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const calendar = readFileSync(new URL('../src/calendar/CalendarView.tsx', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/movement/ExerciseSession.tsx', import.meta.url), 'utf8');

test('Calendar exposes guided exercise only for incomplete workouts on the current day', () => {
  assert.match(calendar, /date === localDate\(\) && firstIncompleteSet >= 0/);
  assert.match(calendar, /> Start exercise</);
});

test('guided sessions separate local camera permission from Meta upload consent', () => {
  assert.match(session, /Enable camera\?/);
  assert.match(session, /Video is not uploaded unless you later choose/);
  assert.match(session, /Upload this set recording temporarily/);
  assert.match(session, /Counted on this device/);
  assert.match(session, /Tracked with SAM 3\.1/);
  assert.match(session, /Coached by Muse Spark 1\.3/);
  assert.match(session, /storedAnalysis/);
  assert.doesNotMatch(session, /movementSummary: \{ \.\.\.set\.movementSummary, metaAnalysis: result \}/);
});

