import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseLandmark } from './types';

export type PoseDetection = {
  poses: PoseLandmark[][];
  worldPoses: PoseLandmark[][];
};

function serialize(landmarks: NormalizedLandmark[]) {
  return landmarks.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility }));
}

async function createLandmarker(delegate: 'GPU' | 'CPU') {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
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

export class CompatibilityPoseRuntime {
  private constructor(private readonly landmarker: PoseLandmarker) {}

  static async create() {
    try {
      return new CompatibilityPoseRuntime(await createLandmarker('GPU'));
    } catch {
      return new CompatibilityPoseRuntime(await createLandmarker('CPU'));
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): PoseDetection {
    const result = this.landmarker.detectForVideo(video, timestampMs);
    return {
      poses: result.landmarks.map(serialize),
      worldPoses: result.worldLandmarks.map(serialize),
    };
  }

  close() {
    this.landmarker.close();
  }
}
