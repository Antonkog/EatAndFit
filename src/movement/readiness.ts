import type { MovementProfileId, PoseLandmark } from './types';

const DEFAULT_REQUIRED_LANDMARKS = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const BODYWEIGHT_SQUAT_LEFT_SIDE = [11, 23, 25, 27] as const;
const BODYWEIGHT_SQUAT_RIGHT_SIDE = [12, 24, 26, 28] as const;

function sideIsVisible(landmarks: PoseLandmark[], indices: readonly number[], threshold: number) {
  return indices.every((index) => (landmarks[index]?.visibility ?? 0) >= threshold);
}

export function evaluatePoseReadiness(profileId: MovementProfileId | undefined, landmarks: PoseLandmark[]) {
  if (profileId === 'bodyweight-squat') {
    return {
      landmarksVisible: sideIsVisible(landmarks, BODYWEIGHT_SQUAT_LEFT_SIDE, 0.45)
        || sideIsVisible(landmarks, BODYWEIGHT_SQUAT_RIGHT_SIDE, 0.45),
      requiredConsecutiveFrames: 5,
      readyMessage: 'Side view tracked on this device',
      waitingMessage: 'Keep one complete side of your body in frame…',
    } as const;
  }

  return {
    landmarksVisible: sideIsVisible(landmarks, DEFAULT_REQUIRED_LANDMARKS, 0.6),
    requiredConsecutiveFrames: 10,
    readyMessage: 'Full body tracked on this device',
    waitingMessage: 'Hold still with your full body in frame…',
  } as const;
}

export function nextReadinessFrameCount(currentCount: number, landmarksVisible: boolean) {
  return landmarksVisible ? currentCount + 1 : 0;
}
