export type ExerciseMedia = {
  video?: Partial<Record<'male' | 'female', string>>;
  thumbnail?: Partial<Record<'male' | 'female', string>>;
};

export type Exercise = {
  id: string;
  name: string;
  body_part: string;
  target: string;
  equipment: string;
  muscle_group: string;
  difficulty: string;
  short_description: string;
  instructions: string;
  breathing: string;
  steps: string[];
  formCues: string[];
  commonMistakes: string[];
  aliases: string[];
  media: ExerciseMedia;
};

export type ExerciseCatalog = {
  version: number;
  groups: Array<{ id: number; title: string }>;
  exercises: Exercise[];
};

