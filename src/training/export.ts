export type TrainingPlanExportRow = {
  session: number;
  date: string;
  sessionTitle: string;
  exercise: string;
  sets: number;
  reps: number;
  estimatedMinutes: number;
  startingWeightKg: number;
  estimatedCalories: number;
};

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function trainingPlanCsv(rows: TrainingPlanExportRow[]) {
  const headings = ['Session', 'Date', 'Session title', 'Exercise', 'Sets', 'Reps', 'Estimated minutes', 'Starting kg', 'Estimated kcal'];
  return [headings, ...rows.map((row) => [row.session, row.date, row.sessionTitle, row.exercise, row.sets, row.reps, row.estimatedMinutes.toFixed(1), row.startingWeightKg, Math.round(row.estimatedCalories)])]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

export function trainingPlanText(rows: TrainingPlanExportRow[], goal: string) {
  const sessions = new Map<number, TrainingPlanExportRow[]>();
  rows.forEach((row) => sessions.set(row.session, [...(sessions.get(row.session) ?? []), row]));
  const lines = ['EAT & FIT PERSONALIZED TRAINING PROGRAM', `Goal: ${goal}`, ''];
  for (const [sessionNumber, items] of sessions) {
    const first = items[0];
    lines.push(`SESSION ${sessionNumber}`, `${first.date} — ${first.sessionTitle}`, '');
    items.forEach((item) => lines.push(`- ${item.exercise}: ${item.sets} sets × ${item.reps} reps · ${item.estimatedMinutes.toFixed(1)} min · ${item.startingWeightKg} kg · approximately ${Math.round(item.estimatedCalories)} kcal`));
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function downloadTrainingPlan(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
