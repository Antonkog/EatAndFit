import type { TrainingGoal } from '../profile/userProfile';

export type GeneratedPlanExercise = {
  exerciseId: string;
  sets: number;
  reps?: number;
  durationMinutes?: number;
};

export type GeneratedPlanSession = {
  title: string;
  exercises: GeneratedPlanExercise[];
};

export type GeneratedTrainingPlan = {
  goal: TrainingGoal;
  sessions: GeneratedPlanSession[];
};

export type CalibrationCorrection = { exerciseId: string; calories: number };
export type CalibrationResponse = { corrections: CalibrationCorrection[] };
