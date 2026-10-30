import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createApiServer } from '../server/api.mjs';
import { DataHiveRecipeProvider, RecipeCatalogError } from '../server/recipe-provider.mjs';

const fixture = new URL('./fixtures/recipes.csv', import.meta.url).pathname;
const importer = new URL('../recipe-import/import_recipes.py', import.meta.url).pathname;

function hash(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function importedCatalog() {
  const directory = mkdtempSync(join(tmpdir(), 'eatandfit-recipes-'));
  const database = join(directory, 'recipes.sqlite');
  const result = spawnSync('python3', [importer, fixture, database, '--expected-rows', '1'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { directory, database };
}

function recommendationCatalog() {
  const { directory, database } = importedCatalog();
  const db = new DatabaseSync(database);
  const rows = [
    ['morning-oats', 'Morning Oats', 320, 14, 7, 'breakfast', 'cereals', 'oats'],
    ['morning-eggs', 'Morning Eggs', 360, 22, 18, 'breakfast', 'egg', 'egg'],
    ['afternoon-chicken', 'Chicken Lunch', 440, 35, 14, 'lunch/dinner', 'main course', 'chicken breast'],
    ['afternoon-beef', 'Beef Lunch', 510, 31, 20, 'lunch/dinner', 'main course', 'lean beef'],
    ['evening-salad', 'Evening Salad', 330, 18, 11, 'lunch/dinner', 'salad', 'chickpeas'],
    ['evening-soup', 'Evening Soup', 290, 14, 8, 'lunch/dinner', 'soup', 'lentils'],
  ] as const;
  const insertRecipe = db.prepare('INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertLabel = db.prepare('INSERT INTO recipe_labels VALUES (?, ?, ?)');
  const insertIngredient = db.prepare('INSERT INTO recipe_ingredients VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO recipes_fts VALUES (?, ?, ?)');
  for (const [id, title, calories, protein, fat, meal, dish, ingredient] of rows) {
    insertRecipe.run(id, title, 'Eat & Fit', `https://example.com/${id}`, 1, calories, protein, 30, fat, 300, '');
    insertLabel.run(id, 'cuisine', 'mediterranean');
    insertLabel.run(id, 'meal', meal);
    insertLabel.run(id, 'dish', dish);
    insertLabel.run(id, 'diet', 'Balanced');
    insertIngredient.run(id, 1, ingredient, ingredient, 100, null, 1);
    insertFts.run(id, title, ingredient);
  }
  db.prepare("UPDATE metadata SET value = '7' WHERE key = 'row_count'").run();
  db.close();
  return { directory, database };
}

test('recipe importer validates before atomic replacement', () => {
  const { directory, database } = importedCatalog();
  try {
    const before = hash(database);
    const failed = spawnSync('python3', [importer, fixture, database, '--expected-rows', '2'], { encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Expected 2 rows, imported 1/);
    assert.equal(hash(database), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('normalized catalog exposes health, facets, search, and details', () => {
  const { directory, database } = importedCatalog();
  try {
    const provider = new DataHiveRecipeProvider({ databasePath: database, expectedRows: 1 });
    assert.deepEqual(provider.getHealth(), {
      status: 'ok', provider: 'datahive', configured: true, ready: true, total: 1, expectedTotal: 1,
    });
    const page = provider.search(new URLSearchParams('query=tomato&page=1&pageSize=12&cuisine=mediterranean'));
    assert.equal(page.total, 1);
    assert.equal(page.items[0].title, 'Tomato Toast');
    assert.equal(page.items[0].nutrition.calories, 240);
    assert.deepEqual(page.facets.cuisines, [{ value: 'mediterranean', count: 1 }]);
    const detail = provider.getRecipe(page.items[0].id);
    assert.deepEqual(detail.ingredientLines, ['2 slices bread', '1 tomato']);
    assert.equal(detail.nutrients.PROCNT.quantity, 8);
    assert.throws(
      () => new DataHiveRecipeProvider({ databasePath: database, expectedRows: 39447 }),
      (error: unknown) => error instanceof RecipeCatalogError && error.status === 503,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('recipe HTTP API returns validated catalog metadata and detail', async () => {
  const { directory, database } = importedCatalog();
  const provider = new DataHiveRecipeProvider({ databasePath: database, expectedRows: 1 });
  const server = createApiServer({ recipeProvider: provider });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/api/recipes/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).total, 1);
    const page = await fetch(`${base}/api/recipes?page=1&pageSize=12`).then((response) => response.json());
    assert.equal(page.totalPages, 1);
    assert.equal(page.items.length, 1);
    const detail = await fetch(`${base}/api/recipes/${page.items[0].id}`).then((response) => response.json());
    assert.equal(detail.title, 'Tomato Toast');
    assert.equal(detail.url, 'https://example.com/tomato-toast');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('daily recommendations are healthy meal-role matches, deterministic, and pagination-safe', () => {
  const { directory, database } = recommendationCatalog();
  try {
    const provider = new DataHiveRecipeProvider({ databasePath: database, expectedRows: 7 });
    const parameters = new URLSearchParams('page=1&pageSize=4&recommendations=daily&recommendationCuisine=mediterranean&recommendationDate=2026-10-30&recommendationVariation=0');
    const first = provider.search(parameters);
    const repeated = provider.search(parameters);
    assert.deepEqual(first.items, repeated.items);
    assert.deepEqual(first.items.slice(0, 3).map((item) => item.recommendationSlot), ['morning', 'afternoon', 'evening']);
    assert.equal(first.items[1].title.includes('Lunch'), true);
    assert.equal(first.items[1].nutrition.protein >= 20, true);
    assert.equal(new Set(first.items.map((item) => item.id)).size, first.items.length);
    assert.equal(first.total, 7);
    const second = provider.search(new URLSearchParams('page=2&pageSize=4&recommendations=daily&recommendationCuisine=mediterranean&recommendationDate=2026-10-30&recommendationVariation=0'));
    assert.equal(second.items.some((item) => item.recommendationSlot), false);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 7);
    const oneAtATime = Array.from({ length: 7 }, (_, index) => provider.search(new URLSearchParams(`page=${index + 1}&pageSize=1&recommendations=daily&recommendationCuisine=mediterranean&recommendationDate=2026-10-30&recommendationVariation=0`)).items[0]);
    assert.deepEqual(oneAtATime.slice(0, 3).map((item) => item.recommendationSlot), ['morning', 'afternoon', 'evening']);
    assert.equal(new Set(oneAtATime.map((item) => item.id)).size, 7);
    const variations = new Set(Array.from({ length: 8 }, (_, variation) => provider.search(new URLSearchParams(`page=1&pageSize=4&recommendations=daily&recommendationCuisine=mediterranean&recommendationDate=2026-10-30&recommendationVariation=${variation}`)).items.slice(0, 3).map((item) => item.id).join(',')));
    assert.ok(variations.size > 1);
    const searched = provider.search(new URLSearchParams('page=1&pageSize=4&query=morning&recommendations=daily&recommendationCuisine=mediterranean&recommendationDate=2026-10-30'));
    assert.equal(searched.items.some((item) => item.recommendationSlot), false);
    assert.throws(
      () => provider.search(new URLSearchParams('recommendations=daily&recommendationCuisine=mediterranean&recommendationDate=2026-02-30')),
      (error: unknown) => error instanceof RecipeCatalogError && error.status === 400,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
