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
  assert.match(recipes, /pageSize: '5'/);
  assert.match(recipes, /role="combobox"/);
  assert.match(recipes, /role="listbox"/);
  assert.match(recipes, /event\.key === 'ArrowDown'/);
});

test('application background is solid dark and recipe filter selections avoid the grey surface tint', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /body \{[\s\S]*background: var\(--background\);/);
  assert.doesNotMatch(styles, /linear-gradient\(rgba\(183,255,79,\.025\)/);
  assert.match(styles, /\.recipe-filter-grid select option \{[^}]*background-color: #090d0a/);
});

test('profile measurements and adult goals stay in compact three-column rows on mobile', () => {
  const profile = readFileSync(new URL('../src/profile/ProfileForm.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(profile, /label: 'Stay fit'/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.profile-measurements \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.profile-goal > div \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});

test('calendar workout, food, and scanned-product entries open stored details', () => {
  const calendar = readFileSync(new URL('../src/calendar/CalendarView.tsx', import.meta.url), 'utf8');
  const details = readFileSync(new URL('../src/calendar/CalendarEntryDetail.tsx', import.meta.url), 'utf8');
  const exercises = readFileSync(new URL('../src/exercises/ExerciseLibrary.tsx', import.meta.url), 'utf8');
  assert.match(calendar, /View \$\{workout\.exerciseName\} details/);
  assert.match(calendar, /View \$\{entry\.title\} details/);
  assert.match(calendar, /<CalendarFoodDetail/);
  assert.match(details, /Scanned product · Open Food Facts/);
  assert.match(details, /Product details/);
  assert.match(details, /Ingredients/);
  assert.match(exercises, /export function ExerciseDetail/);
});

test('browser tab uses the same lime dumbbell brand mark as the application', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('../public/eat-and-fit-mark.svg', import.meta.url), 'utf8');
  assert.match(html, /eat-and-fit-mark\.svg\?v=2/);
  assert.match(icon, /fill="#B7FF4F"/);
  assert.match(icon, /stroke="#101712"/);
  assert.doesNotMatch(icon, />EF</);
  assert.doesNotMatch(html, /favicon\.svg/);
});

test('localized meal suggestions stay inside the existing recipe grid', () => {
  const recipes = readFileSync(new URL('../src/recipes/RecipeView.tsx', import.meta.url), 'utf8');
  assert.match(recipes, /Refresh suggestions/);
  assert.match(recipes, /recommendationSlot/);
  assert.match(recipes, /recommendations', 'daily'/);
  assert.equal((recipes.match(/className="recipe-grid"/g) ?? []).length, 1);
});

test('balance actions remain while the Log today eyebrow is removed', () => {
  const balance = readFileSync(new URL('../src/balance/BalanceView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(balance, /Log today/);
  assert.match(balance, /Update your balance/);
  assert.match(balance, /Add food/);
  assert.match(balance, /Add exercise/);
});
