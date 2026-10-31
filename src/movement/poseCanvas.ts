import type { PoseLandmark } from './types';

const connections: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32],
];

export function drawPose(canvas: HTMLCanvasElement, landmarks: PoseLandmark[]) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 4;
  context.strokeStyle = '#b7ff4f';
  context.fillStyle = '#f7ffe9';
  context.shadowColor = 'rgba(183, 255, 79, .55)';
  context.shadowBlur = 8;
  for (const [a, b] of connections) {
    if ((landmarks[a]?.visibility ?? 1) < 0.5 || (landmarks[b]?.visibility ?? 1) < 0.5) continue;
    context.beginPath();
    context.moveTo((1 - landmarks[a].x) * canvas.width, landmarks[a].y * canvas.height);
    context.lineTo((1 - landmarks[b].x) * canvas.width, landmarks[b].y * canvas.height);
    context.stroke();
  }
  for (const point of landmarks) {
    if ((point.visibility ?? 1) < 0.5) continue;
    context.beginPath();
    context.arc((1 - point.x) * canvas.width, point.y * canvas.height, 3.5, 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
}

