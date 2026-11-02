import type { MovementProfileId, PoseLandmark } from './types';
import { MIN_COUNTING_VISIBILITY, selectBodyweightSquatSide } from './trackingConfidence';

const DEFAULT_REQUIRED_LANDMARKS = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28] as const;

function sideIsVisible(landmarks: PoseLandmark[], indices: readonly number[], threshold: number) {
  return indices.every((index) => (landmarks[index]?.visibility ?? 0) >= threshold);
}

export function evaluatePoseReadiness(profileId: MovementProfileId | undefined, landmarks: PoseLandmark[]) {
  if (profileId === 'bodyweight-squat') {
    const side = selectBodyweightSquatSide(landmarks);
    return {
      landmarksVisible: Boolean(side && side.confidence >= MIN_COUNTING_VISIBILITY),
      requiredConsecutiveFrames: 5,
      readyMessage: 'Tracking ready',
      waitingMessage: 'Keep one complete side of your body in frame…',
    } as const;
  }

  return {
    landmarksVisible: sideIsVisible(landmarks, DEFAULT_REQUIRED_LANDMARKS, 0.6),
    requiredConsecutiveFrames: 10,
    readyMessage: 'Tracking ready',
    waitingMessage: 'Hold still with your full body in frame…',
  } as const;
}

export function nextReadinessFrameCount(currentCount: number, landmarksVisible: boolean) {
  return landmarksVisible ? currentCount + 1 : 0;
}
