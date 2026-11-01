import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const session = readFileSync(new URL('../src/movement/ExerciseSession.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/movement/pose.worker.ts', import.meta.url), 'utf8');
const compatibility = readFileSync(new URL('../src/movement/poseCompatibility.ts', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../src/movement/readiness.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('camera session renders one live preview and exposes the skeleton before readiness', () => {
  assert.equal(session.match(/<video ref=\{videoRef\}/g)?.length, 1);
  assert.ok(session.indexOf('drawPose(canvasRef.current, landmarks)') < session.indexOf('evaluatePoseReadiness(profile?.id, landmarks)'));
  assert.match(session, /loadedmetadata/);
  assert.match(session, /orientationchange/);
  assert.match(session, /\.addEventListener\('resize'/);
  assert.match(styles, /\.camera-stage video, \.camera-stage canvas[^}]+transform: scaleX\(-1\)/);
  assert.doesNotMatch(session, /cameraMirrored|camera-stage\$\{cameraMirrored/);
});

test('exercise tracking requests only the front camera', () => {
  assert.match(session, /facingMode: \{ exact: 'user' \}/);
  assert.match(session, /facingMode: \{ ideal: 'user' \}/);
  assert.match(session, /width: \{ ideal: 1280 \}/);
  assert.match(session, /height: \{ ideal: 720 \}/);
  assert.doesNotMatch(session, /facingMode: \{ ideal: 'environment' \}/);
  assert.doesNotMatch(session, /zoom/);
});

test('saving a repetition does not restart the live camera preview', () => {
  assert.match(session, /onSaveRef\.current\(partial\)/);
  assert.match(session, /cameraPreviewVisible/);
  assert.match(session, /if \(video\.srcObject !== stream\) video\.srcObject = stream/);
  assert.match(session, /if \(video\.paused\) await video\.play\(\)/);
  assert.doesNotMatch(session, /\[scheduleNextFrame, showCameraRecovery, stage, syncMediaGeometry\]/);
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

test('camera video fills the viewport on desktop and landscape as well', () => {
  assert.match(styles, /\.exercise-session\.camera-session-open[^}]+height: 100dvh/);
  assert.match(styles, /\.exercise-session\.camera-session-open \.camera-session[^}]+height: 100dvh/);
  assert.match(styles, /\.exercise-session\.camera-session-open \.camera-stage[^}]+height: 100%/);
});

test('camera session delegates readiness without delaying skeleton rendering', () => {
  assert.match(session, /evaluatePoseReadiness\(profile\?\.id, landmarks\)/);
  assert.match(readiness, /DEFAULT_REQUIRED_LANDMARKS = \[11, 12, 15, 16, 23, 24, 25, 26, 27, 28\]/);
  assert.match(readiness, /DEFAULT_REQUIRED_LANDMARKS, 0\.6/);
  assert.match(readiness, /requiredConsecutiveFrames: 10/);
});

test('stable tracking automatically starts the three-second countdown', () => {
  assert.match(session, /if \(stage !== 'setup' \|\| !trackingStable\) return;/);
  assert.match(session, /void startCameraSet\(\)/);
  assert.match(session, /Tracking ready\. Starting automatically…/);
  assert.match(session, /spoken\('Three'\)/);
  assert.match(session, /spoken\('Go'\)/);
  assert.doesNotMatch(session, /> Start set</);
});
