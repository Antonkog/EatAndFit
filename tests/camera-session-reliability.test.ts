import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const session = readFileSync(new URL('../src/movement/ExerciseSession.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/movement/pose.worker.ts', import.meta.url), 'utf8');
const compatibility = readFileSync(new URL('../src/movement/poseCompatibility.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('camera session renders one live preview and exposes the skeleton before readiness', () => {
  assert.equal(session.match(/<video ref=\{videoRef\}/g)?.length, 1);
  assert.ok(session.indexOf('drawPose(canvasRef.current, landmarks)') < session.indexOf('const fullBodyVisible'));
  assert.match(session, /loadedmetadata/);
  assert.match(session, /orientationchange/);
  assert.match(session, /\.addEventListener\('resize'/);
  assert.match(styles, /\.camera-stage video, \.camera-stage canvas[^}]+transform: scaleX\(-1\)/s);
});

test('camera tracking has worker, CPU, frame, timeout, and compatibility fallbacks', () => {
  assert.match(worker, /createLandmarker\('GPU'\)/);
  assert.match(worker, /createLandmarker\('CPU'\)/);
  assert.match(worker, /phase: 'init'/);
  assert.match(worker, /phase: 'frame'/);
  assert.match(compatibility, /CompatibilityPoseRuntime/);
  assert.match(compatibility, /detectForVideo\(video, timestampMs\)/);
  assert.match(session, /requestVideoFrameCallback/);
  assert.match(session, /12_000/);
  assert.match(session, /context\.drawImage\(video/);
  assert.match(session, /startCompatibilityTracking/);
  assert.match(session, /Pose tracking could not start on this device/);
});

test('camera interruption preserves progress and offers both recovery paths', () => {
  assert.match(session, /document\.addEventListener\('visibilitychange'/);
  assert.match(session, /persistCameraProgress\(count, accumulatedSeconds\)/);
  assert.match(session, /baseRepCountRef\.current = count/);
  assert.match(session, /baseDurationSecondsRef\.current = accumulatedSeconds/);
  assert.match(session, /streamIsLive/);
  assert.match(session, /setStage\('setup'\)/);
  assert.match(session, /camera-paused/);
  assert.match(session, /> Enable camera</);
  assert.match(session, /> Start timer</);
  assert.match(session, /Camera access is blocked/);
});

test('portrait camera session fills the viewport and overlays a translucent instruction panel', () => {
  assert.match(styles, /@media \(max-width: 600px\) and \(orientation: portrait\)/);
  assert.match(styles, /\.exercise-session\.camera-session-open[^}]+height: 100dvh/);
  assert.match(styles, /\.camera-session-open \.camera-stage[^}]+height: 100%/);
  assert.match(styles, /object-fit: contain/);
  assert.match(styles, /background: rgba\(4,6,4,\.5\)/);
});

test('first reliability commit retains the existing bilateral readiness gate', () => {
  assert.match(session, /const required = \[11, 12, 15, 16, 23, 24, 25, 26, 27, 28\]/);
  assert.match(session, />= 0\.6/);
  assert.match(session, /stablePoseFramesRef\.current >= 10/);
});
