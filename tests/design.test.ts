import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { muscleGroups } from '../src/exercises/ExerciseLibrary';
import type { ExerciseCatalog } from '../src/exercises/types';

const catalog = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8')) as ExerciseCatalog;

test('restored muscle browser matches the original 22 groups and counts', () => {
  const counts = muscleGroups.map((group) => catalog.exercises.filter((exercise) => group.targets.includes(exercise.target.toLowerCase())).length);
  assert.equal(muscleGroups.length, 22);
  assert.deepEqual(counts, [2, 2, 29, 2, 26, 21, 26, 6, 39, 17, 12, 27, 5, 7, 19, 17, 8, 2, 12, 17, 10, 11]);
});

test('exercise hero omits library statistics and instructional copy', () => {
  const source = readFileSync(new URL('../src/exercises/ExerciseLibrary.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Library statistics/);
  assert.doesNotMatch(source, /Start with a muscle group/);
  assert.doesNotMatch(source, /<span>Muscle groups<\/span>/);
});

test('action buttons share the dark style and green pressed feedback', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.primary-button, \.text-button, \.upload-button \{[^}]*background: rgba\(183,255,79,\.08\)/);
  assert.match(styles, /eatfit-action-flash/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.recipe-action-button \{ width: 220px; \}/);
  assert.match(styles, /\.photo-preview \.photo-source-button \{ width: 100%; \}/);
});

test('scan and recipe controls use the revised copy and matching action sizes', () => {
  const scan = readFileSync(new URL('../src/scanner/ScanView.tsx', import.meta.url), 'utf8');
  const recipes = readFileSync(new URL('../src/recipes/RecipeView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(scan, /Recognize ingredients from a photo or scan a packaged product barcode/);
  assert.equal((scan.match(/photo-source-button/g) ?? []).length, 4);
  assert.equal((recipes.match(/recipe-action-button/g) ?? []).length, 2);
});
