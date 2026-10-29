import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export class NutritionCatalogError extends Error {
  constructor(message, status = 500, code = 'nutrition_error') {
    super(message);
    this.name = 'NutritionCatalogError';
    this.status = status;
    this.code = code;
  }
}

function normalizeQuery(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 12) ?? [];
}

function ftsQuery(value) {
  return normalizeQuery(value)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' AND ');
}

function simpleFtsQuery(value) {
  return normalizeQuery(value)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' ');
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new NutritionCatalogError(`Invalid ${name}.`, 400, `invalid_${name}`);
  }
  return parsed;
}

export class NutritionProvider {
  constructor({ databasePath = './data/nutrition.sqlite' } = {}) {
    if (!existsSync(databasePath)) {
      throw new NutritionCatalogError(
        'The local USDA nutrition database has not been imported yet.',
        503,
        'nutrition_database_unavailable',
      );
    }

    try {
      this.database = new DatabaseSync(databasePath, { readOnly: true });
      this.database.exec('PRAGMA query_only = ON');
      const check = this.database.prepare('PRAGMA quick_check').get();
      if (Object.values(check ?? {})[0] !== 'ok') throw new Error('Integrity check failed.');
      const tables = new Set(
        this.database
          .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
          .all()
          .map((row) => row.name),
      );
      if (tables.has('foods_fts') && tables.has('food_portions')) this.schema = 'normalized';
      else if (tables.has('food_search') && tables.has('portions')) this.schema = 'simple';
      else throw new Error('Unsupported nutrition database schema.');
    } catch {
      this.database?.close();
      throw new NutritionCatalogError(
        'The local USDA nutrition database is unavailable.',
        503,
        'nutrition_database_unavailable',
      );
    }
  }

  getHealth() {
    const foods = Number(this.database.prepare('SELECT COUNT(*) AS count FROM foods').get().count);
    const nutrients = Number(
      this.database.prepare('SELECT COUNT(*) AS count FROM food_nutrients').get().count,
    );
    return {
      status: 'ok',
      provider: 'usda-fooddata-central',
      configured: true,
      ready: foods > 0,
      license: 'CC0 1.0 Universal',
      schema: this.schema,
      foods,
      nutrientValues: nutrients,
    };
  }

  search(value) {
    const query = String(value ?? '').trim();
    if (!query) return { items: [] };
    const match = this.schema === 'normalized' ? ftsQuery(query) : simpleFtsQuery(query);
    if (!match) return { items: [] };

    const statement = this.schema === 'normalized'
      ? `SELECT f.fdc_id AS fdcId, f.description, f.data_type AS dataType
         FROM foods_fts
         JOIN foods f ON f.fdc_id = CAST(foods_fts.fdc_id AS INTEGER)
         WHERE foods_fts MATCH ?
         ORDER BY bm25(foods_fts), f.description COLLATE NOCASE
         LIMIT 20`
      : `SELECT f.fdc_id AS fdcId, f.description, f.data_type AS dataType
         FROM food_search
         JOIN foods f ON f.fdc_id = CAST(food_search.fdc_id AS INTEGER)
         WHERE food_search MATCH ?
         ORDER BY rank, f.description COLLATE NOCASE
         LIMIT 20`;
    return { items: this.database.prepare(statement).all(match) };
  }

  getFood(value) {
    const id = positiveInteger(value, 'food_id');
    const food = this.database
      .prepare('SELECT fdc_id AS fdcId, description, data_type AS dataType FROM foods WHERE fdc_id = ?')
      .get(id);
    if (!food) return null;

    if (this.schema === 'normalized') {
      food.nutrients = this.database
        .prepare(
          `SELECT n.name, n.unit_name AS unit, fn.amount
           FROM food_nutrients fn
           JOIN nutrients n ON n.id = fn.nutrient_id
           WHERE fn.food_id = ?
           ORDER BY COALESCE(n.rank, 999999), n.name`,
        )
        .all(id);
      food.portions = this.database
        .prepare(
          `SELECT p.amount, COALESCE(u.name, p.modifier, p.portion_description, 'portion') AS unit,
                  p.gram_weight AS grams, p.portion_description AS description, p.modifier
           FROM food_portions p
           LEFT JOIN measure_units u
             ON u.dataset_key = p.dataset_key AND u.source_id = p.measure_unit_id
           WHERE p.food_id = ?
           ORDER BY COALESCE(p.sequence_number, 999999), p.id`,
        )
        .all(id);
    } else {
      food.nutrients = this.database
        .prepare(
          `SELECT n.name, n.unit, fn.amount
           FROM food_nutrients fn
           JOIN nutrients n ON n.id = fn.nutrient_id
           WHERE fn.fdc_id = ? ORDER BY n.name`,
        )
        .all(id);
      food.portions = this.database
        .prepare('SELECT amount, unit, grams FROM portions WHERE fdc_id = ?')
        .all(id);
    }
    return food;
  }

  calculate(items) {
    if (!Array.isArray(items)) {
      throw new NutritionCatalogError('items must be an array.', 400, 'invalid_items');
    }
    const totals = new Map();
    for (const item of items.slice(0, 100)) {
      const grams = Number(item?.grams);
      if (!Number.isFinite(grams) || grams < 0) {
        throw new NutritionCatalogError('Ingredient grams must be zero or greater.', 400, 'invalid_grams');
      }
      const food = this.getFood(item?.fdcId);
      if (!food) continue;
      for (const nutrient of food.nutrients) {
        const key = `${nutrient.name}|${nutrient.unit}`;
        totals.set(key, (totals.get(key) ?? 0) + (Number(nutrient.amount) || 0) * grams / 100);
      }
    }
    return {
      nutrients: [...totals].map(([key, amount]) => {
        const [name, unit] = key.split('|');
        return { name, unit, amount };
      }),
    };
  }
}

export function createNutritionProvider(options) {
  return new NutritionProvider(options);
}
