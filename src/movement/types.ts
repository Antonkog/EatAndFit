export type PoseLandmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

export type PoseFrame = {
  timestampMs: number;
  landmarks: PoseLandmark[];
};

export type MovementEvidence = {
  metric: string;
  label: string;
  value: number;
  unit: 'degrees' | 'seconds' | 'ratio' | 'percent';
  target?: string;
};

export type SupportedFormIssue = 'range_of_motion' | 'camera_position';
export type TrackingFailure = 'low_visibility' | 'wrong_camera_angle' | 'multiple_people' | 'tracking_lost';

export type FormAssessment =
  | { status: 'good_form'; evidence: MovementEvidence[] }
  | { status: 'correction_needed'; issue: SupportedFormIssue; evidence: MovementEvidence[] }
  | { status: 'insufficient_evidence'; reason: TrackingFailure; evidence: MovementEvidence[] };

export type RepMeasurement = {
  index: number;
  startMs: number;
  endMs: number;
  confidence: number;
  assessment: FormAssessment;
};

export type MetaCoaching = {
  status: FormAssessment['status'];
  positiveObservation: string | null;
  primaryCorrection: string | null;
  nextSetGoal: string | null;
  evidenceMetric: string | null;
};

export type SamTrackBox = {
  timestampMs: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MetaMovementAnalysis = {
  sam: {
    model: string;
    coverage: number;
    confidence: number | null;
    sourceWidth: number;
    sourceHeight: number;
    boxes: SamTrackBox[];
  };
  coaching: MetaCoaching;
  museModel: string;
  processedAt: string;
};

export type StoredMetaMovementAnalysis = {
  samModel: string;
  trackingCoverage: number;
  trackingConfidence: number | null;
  coaching: MetaCoaching;
  museModel: string;
  processedAt: string;
};

export type MovementSummary = {
  profileId: string;
  profileVersion: number;
  mode: 'camera' | 'timer';
  completedReps: number;
  elapsedSeconds: number;
  reps: RepMeasurement[];
  selectedRep?: number;
  metaAnalysis?: StoredMetaMovementAnalysis;
};

export type MovementProfileId =
  | 'bodyweight-squat'
  | 'barbell-back-squat'
  | 'dumbbell-deadlift'
  | 'barbell-bench-press'
  | 'pull-up'
  | 'military-press'
  | 'push-up'
  | 'jumping-jack';

export type CameraView = 'front' | 'side';

export type MovementProfile = {
  id: MovementProfileId;
  version: number;
  exerciseIds: string[];
  displayName: string;
  cameraView: CameraView;
  setupInstruction: string;
  countMetricLabel: string;
  countUnit: MovementEvidence['unit'];
  goodFormTarget: string;
};

