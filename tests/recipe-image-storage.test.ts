import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('generated recipe photos use bounded local storage and Calendar object URLs', () => {
  const database = readFileSync(new URL('../src/data/db.ts', import.meta.url), 'utf8');
  const compression = readFileSync(new URL('../src/ai/recipeImageStorage.ts', import.meta.url), 'utf8');
  const calendarImage = readFileSync(new URL('../src/data/useFoodImage.ts', import.meta.url), 'utf8');
  assert.match(database, /const VERSION = 2/);
  assert.match(database, /createObjectStore\('recipeImages'/);
  assert.match(database, /transaction\(\['workouts', 'food', 'products', 'recipeImages'\]/);
  assert.match(compression, /MAX_SAVED_IMAGE_BYTES = 1_000_000/);
  assert.match(compression, /image\/webp/);
  assert.match(calendarImage, /URL\.createObjectURL/);
  assert.match(calendarImage, /URL\.revokeObjectURL/);
});
