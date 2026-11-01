import type { PoseLandmark } from './types';

export const MIN_COUNTING_VISIBILITY = 0.6;
export const MIN_SQUAT_SHOULDER_VISIBILITY = 0.45;

export function averageLandmarkVisibility(points: PoseLandmark[]) {
  return points.length
    ? points.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / points.length
    : 0;
}

type SquatSide = {
  shoulder: PoseLandmark;
  joints: [PoseLandmark, PoseLandmark, PoseLandmark];
  confidence: number;
};

export function selectBodyweightSquatSide(landmarks: PoseLandmark[]): SquatSide | undefined {
  if (landmarks.length < 29) return undefined;
  const sides: SquatSide[] = [
    {
      shoulder: landmarks[11],
      joints: [landmarks[23], landmarks[25], landmarks[27]],
      confidence: averageLandmarkVisibility([landmarks[23], landmarks[25], landmarks[27]]),
    },
    {
      shoulder: landmarks[12],
      joints: [landmarks[24], landmarks[26], landmarks[28]],
      confidence: averageLandmarkVisibility([landmarks[24], landmarks[26], landmarks[28]]),
    },
  ];
  return sides
    .filter((side) => (side.shoulder?.visibility ?? 0) >= MIN_SQUAT_SHOULDER_VISIBILITY)
    .sort((left, right) => right.confidence - left.confidence)[0];
}
