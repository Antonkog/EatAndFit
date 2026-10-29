import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
