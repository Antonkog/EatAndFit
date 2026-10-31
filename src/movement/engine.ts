import type {
  FormAssessment,
  MovementEvidence,
  MovementProfile,
  PoseFrame,
  PoseLandmark,
  RepMeasurement,
} from './types';

const STABLE_FRAMES = 5;
const MIN_VISIBILITY = 0.6;
const MIN_REP_MS = 800;
const MAX_REP_MS = 8000;
const DUPLICATE_GUARD_MS = 700;

type Phase = 'finding_start' | 'finding_peak' | 'finding_return';
type MetricFrame = {
  visible: boolean;
  confidence: number;
  start: boolean;
  peak: boolean;
  value: number;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function angle(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark) {
  const first = { x: a.x - b.x, y: a.y - b.y };
  const second = { x: c.x - b.x, y: c.y - b.y };
  const denominator = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (!denominator) return 0;
  const cosine = Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
}

function landmarkVisibility(points: PoseLandmark[]) {
  return average(points.map((point) => point.visibility ?? 1));
}

function bestSide(landmarks: PoseLandmark[], joints: [number, number, number]) {
  const left = joints.map((index) => landmarks[index]);
  const right = joints.map((index) => landmarks[index + 1]);
  return landmarkVisibility(left) >= landmarkVisibility(right) ? left : right;
}

function angleMetric(landmarks: PoseLandmark[], joints: [number, number, number]) {
  const points = bestSide(landmarks, joints);
  return { value: angle(points[0], points[1], points[2]), confidence: landmarkVisibility(points) };
}

function distance(a: PoseLandmark, b: PoseLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function metricFor(profile: MovementProfile, frame: PoseFrame): MetricFrame {
  const landmarks = frame.landmarks;
  if (landmarks.length < 33) return { visible: false, confidence: 0, start: false, peak: false, value: 0 };

  if (profile.id === 'jumping-jack') {
    const required = [landmarks[11], landmarks[12], landmarks[15], landmarks[16], landmarks[27], landmarks[28]];
    const confidence = landmarkVisibility(required);
    const shoulderWidth = Math.max(distance(landmarks[11], landmarks[12]), 0.02);
    const stanceRatio = distance(landmarks[27], landmarks[28]) / shoulderWidth;
    const handsDown = landmarks[15].y > landmarks[11].y && landmarks[16].y > landmarks[12].y;
    const handsUp = landmarks[15].y < landmarks[11].y && landmarks[16].y < landmarks[12].y;
    return { visible: confidence >= MIN_VISIBILITY, confidence, start: stanceRatio <= 1.25 && handsDown, peak: stanceRatio >= 1.55 && handsUp, value: stanceRatio };
  }

  if (profile.id === 'military-press') {
    const { value, confidence } = angleMetric(landmarks, [11, 13, 15]);
    return { visible: confidence >= MIN_VISIBILITY, confidence, start: value <= 115, peak: value >= 145, value };
  }

  const joints: [number, number, number] = profile.id === 'bodyweight-squat' || profile.id === 'barbell-back-squat'
    ? [23, 25, 27]
    : profile.id === 'dumbbell-deadlift'
      ? [11, 23, 25]
      : [11, 13, 15];
  const { value, confidence } = angleMetric(landmarks, joints);
  const thresholds = profile.id === 'pull-up'
    ? { start: 145, peak: 110 }
    : profile.id === 'barbell-bench-press' || profile.id === 'push-up'
      ? { start: 145, peak: 115 }
      : { start: 150, peak: 125 };
  return { visible: confidence >= MIN_VISIBILITY, confidence, start: value >= thresholds.start, peak: value <= thresholds.peak, value };
}

function evidenceFor(profile: MovementProfile, value: number, durationMs: number, confidence: number): MovementEvidence[] {
  return [
    { metric: 'primary_range', label: profile.countMetricLabel, value: Math.round(value * 10) / 10, unit: profile.countUnit, target: profile.goodFormTarget },
    { metric: 'rep_duration', label: 'Rep duration', value: Math.round(durationMs / 100) / 10, unit: 'seconds', target: '0.8–8.0 seconds' },
    { metric: 'tracking_confidence', label: 'Tracking confidence', value: Math.round(confidence * 100), unit: 'percent', target: '65% or higher' },
  ];
}

function assess(profile: MovementProfile, value: number, durationMs: number, confidence: number): FormAssessment {
  const evidence = evidenceFor(profile, value, durationMs, confidence);
  if (confidence < 0.65) return { status: 'insufficient_evidence', reason: 'low_visibility', evidence };
  const meetsTarget = profile.id === 'military-press' || profile.id === 'jumping-jack'
    ? value >= (profile.id === 'military-press' ? 155 : 1.8)
    : value <= (profile.id === 'pull-up' ? 90 : profile.id === 'barbell-bench-press' || profile.id === 'push-up' ? 100 : 110);
  return meetsTarget
    ? { status: 'good_form', evidence }
    : { status: 'correction_needed', issue: 'range_of_motion', evidence };
}

export class MovementTracker {
  readonly profile: MovementProfile;
  private phase: Phase = 'finding_start';
  private stableStart = 0;
  private stablePeak = 0;
  private repStartedAt = 0;
  private lastRepAt = -Infinity;
  private values: number[] = [];
  private confidences: number[] = [];
  private completed: RepMeasurement[] = [];

  constructor(profile: MovementProfile) {
    this.profile = profile;
  }

  process(frame: PoseFrame) {
    const metric = metricFor(this.profile, frame);
    if (!metric.visible) {
      this.stableStart = 0;
      this.stablePeak = 0;
      return undefined;
    }

    this.stableStart = metric.start ? this.stableStart + 1 : 0;
    this.stablePeak = metric.peak ? this.stablePeak + 1 : 0;

    if (this.phase === 'finding_start') {
      if (this.stableStart >= STABLE_FRAMES) {
        this.phase = 'finding_peak';
        this.repStartedAt = frame.timestampMs;
        this.values = [metric.value];
        this.confidences = [metric.confidence];
      }
      return undefined;
    }

    this.values.push(metric.value);
    this.confidences.push(metric.confidence);
    if (frame.timestampMs - this.repStartedAt > MAX_REP_MS) {
      this.reset(frame.timestampMs);
      return undefined;
    }

    if (this.phase === 'finding_peak') {
      if (this.stablePeak >= STABLE_FRAMES) this.phase = 'finding_return';
      return undefined;
    }

    if (this.stableStart < STABLE_FRAMES) return undefined;
    const durationMs = frame.timestampMs - this.repStartedAt;
    if (durationMs < MIN_REP_MS || frame.timestampMs - this.lastRepAt < DUPLICATE_GUARD_MS) return undefined;
    const value = this.profile.id === 'military-press' || this.profile.id === 'jumping-jack'
      ? Math.max(...this.values)
      : Math.min(...this.values);
    const confidence = average(this.confidences);
    const rep: RepMeasurement = {
      index: this.completed.length + 1,
      startMs: this.repStartedAt,
      endMs: frame.timestampMs,
      confidence,
      assessment: assess(this.profile, value, durationMs, confidence),
    };
    this.completed.push(rep);
    this.lastRepAt = frame.timestampMs;
    this.phase = 'finding_peak';
    this.repStartedAt = frame.timestampMs;
    this.values = [metric.value];
    this.confidences = [metric.confidence];
    this.stablePeak = 0;
    return rep;
  }

  addManualRep(timestampMs = performance.now()) {
    const rep: RepMeasurement = {
      index: this.completed.length + 1,
      startMs: timestampMs,
      endMs: timestampMs,
      confidence: 0,
      assessment: { status: 'insufficient_evidence', reason: 'tracking_lost', evidence: [] },
    };
    this.completed.push(rep);
    return rep;
  }

  undoLastRep() {
    return this.completed.pop();
  }

  get reps() {
    return [...this.completed];
  }

  private reset(timestampMs: number) {
    this.phase = 'finding_start';
    this.stableStart = 0;
    this.stablePeak = 0;
    this.repStartedAt = timestampMs;
    this.values = [];
    this.confidences = [];
  }
}

export function selectRepresentativeRep(reps: RepMeasurement[]) {
  const valid = reps.filter((rep) => rep.assessment.status !== 'insufficient_evidence');
  const correction = valid.find((rep) => rep.assessment.status === 'correction_needed');
  if (correction) return correction;
  if (!valid.length) return reps[0];
  const ordered = [...valid].sort((a, b) => a.confidence - b.confidence);
  return ordered[Math.floor(ordered.length / 2)];
}

