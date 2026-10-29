import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { NutritionProvider } from '../server/nutrition-provider.mjs';

function normalizedDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'eatandfit-nutrition-'));
  const path = join(directory, 'nutrition.sqlite');
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE foods(fdc_id INTEGER PRIMARY KEY, description TEXT, normalized_description TEXT, data_type TEXT, dataset_key TEXT, category_source_id INTEGER);
    CREATE VIRTUAL TABLE foods_fts USING fts5(fdc_id UNINDEXED, description);
    CREATE TABLE nutrients(id INTEGER PRIMARY KEY, name TEXT, unit_name TEXT, rank INTEGER);
    CREATE TABLE food_nutrients(food_id INTEGER, nutrient_id INTEGER, amount REAL);
    CREATE TABLE food_portions(id INTEGER PRIMARY KEY, food_id INTEGER, dataset_key TEXT, measure_unit_id INTEGER, sequence_number INTEGER, amount REAL, portion_description TEXT, modifier TEXT, gram_weight REAL);
    CREATE TABLE measure_units(dataset_key TEXT, source_id INTEGER, name TEXT);
    INSERT INTO foods VALUES (123, 'Spinach, raw', 'spinach raw', 'foundation_food', 'foundation', NULL);
    INSERT INTO foods_fts VALUES (123, 'Spinach, raw');
    INSERT INTO nutrients VALUES (1003, 'Protein', 'G', 600);
    INSERT INTO food_nutrients VALUES (123, 1003, 2.86);
    INSERT INTO measure_units VALUES ('foundation', 1, 'cup');
    INSERT INTO food_portions VALUES (1, 123, 'foundation', 1, 1, 1, '1 cup', NULL, 30);
  `);
  database.close();
  return { directory, path };
}

test('reads the normalized USDA production schema', () => {
  const fixture = normalizedDatabase();
  try {
    const provider = new NutritionProvider({ databasePath: fixture.path });
    assert.equal(provider.getHealth().schema, 'normalized');
    assert.equal(provider.getHealth().foods, 1);
    assert.equal(provider.search('spinach').items[0].fdcId, 123);
    const food = provider.getFood(123);
    assert.equal(food?.nutrients[0].amount, 2.86);
    assert.equal(food?.portions[0].grams, 30);
    assert.equal(provider.calculate([{ fdcId: 123, grams: 50 }]).nutrients[0].amount, 1.43);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
