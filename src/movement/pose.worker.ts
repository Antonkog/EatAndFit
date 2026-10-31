/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

type InitMessage = { type: 'init' };
type FrameMessage = { type: 'frame'; frame: ImageBitmap; timestampMs: number };
type WorkerRequest = InitMessage | FrameMessage;

let landmarker: PoseLandmarker | undefined;
let running = false;

async function createLandmarker(delegate: 'GPU' | 'CPU') {
  const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: '/mediapipe/models/pose_landmarker_lite.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 2,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}

async function initialize() {
  if (landmarker) return;
  try {
    landmarker = await createLandmarker('GPU');
  } catch {
    landmarker = await createLandmarker('CPU');
  }
  postMessage({ type: 'ready' });
}

function serialize(landmarks: NormalizedLandmark[]) {
  return landmarks.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility }));
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'init') {
    try { await initialize(); }
    catch (error) { postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Pose tracking could not start.' }); }
    return;
  }

  const { frame, timestampMs } = event.data;
  if (running || !landmarker) { frame.close(); return; }
  running = true;
  try {
    const result = landmarker.detectForVideo(frame, timestampMs);
    postMessage({
      type: 'pose',
      timestampMs,
      poses: result.landmarks.map(serialize),
      worldPoses: result.worldLandmarks.map(serialize),
    });
  } catch (error) {
    postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Pose tracking failed.' });
  } finally {
    frame.close();
    running = false;
  }
};

