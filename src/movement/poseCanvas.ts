import type { PoseLandmark } from './types';

const connections: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32],
];

const DRAW_VISIBILITY = 0.2;

export type PoseCanvasSource = { width: number; height: number; fit?: 'contain' | 'cover' };

export function drawPose(canvas: HTMLCanvasElement, landmarks: PoseLandmark[], source: PoseCanvasSource) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const density = Math.max(1, window.devicePixelRatio || 1);
  const displayWidth = canvas.width / density;
  const displayHeight = canvas.height / density;
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const scale = source.fit === 'cover'
    ? Math.max(displayWidth / sourceWidth, displayHeight / sourceHeight)
    : Math.min(displayWidth / sourceWidth, displayHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (displayWidth - renderedWidth) / 2;
  const offsetY = (displayHeight - renderedHeight) / 2;
  const point = (landmark: PoseLandmark) => ({
    x: offsetX + landmark.x * renderedWidth,
    y: offsetY + landmark.y * renderedHeight,
  });

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(density, 0, 0, density, 0, 0);
  context.lineWidth = 4;
  context.strokeStyle = '#b7ff4f';
  context.fillStyle = '#f7ffe9';
  context.shadowColor = 'rgba(183, 255, 79, .55)';
  context.shadowBlur = 8;
  for (const [a, b] of connections) {
    if ((landmarks[a]?.visibility ?? 1) < DRAW_VISIBILITY || (landmarks[b]?.visibility ?? 1) < DRAW_VISIBILITY) continue;
    const start = point(landmarks[a]);
    const end = point(landmarks[b]);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  for (const landmark of landmarks) {
    if ((landmark.visibility ?? 1) < DRAW_VISIBILITY) continue;
    const position = point(landmark);
    context.beginPath();
    context.arc(position.x, position.y, 3.5, 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
  context.setTransform(1, 0, 0, 1, 0, 0);
}

