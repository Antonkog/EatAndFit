import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const FACETS = [
  ['cuisine', 'cuisines'],
  ['dish', 'dishTypes'],
  ['meal', 'mealTypes'],
  ['diet', 'dietLabels'],
  ['health', 'healthLabels'],
];

export class RecipeCatalogError extends Error {
  constructor(message, status = 503, code = 'dataset_unavailable') {
    super(message);
    this.name = 'RecipeCatalogError';
    this.status = status;
    this.code = code;
  }
}

function number(value) {
  return value == null ? null : Number(value);
}

function positiveInteger(value, fallback, maximum = Number.POSITIVE_INFINITY) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new RecipeCatalogError('Invalid pagination value.', 400, 'invalid_filter');
  }
  return parsed;
}

function optionalNumber(value, name) {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RecipeCatalogError(`Invalid ${name} value.`, 400, 'invalid_filter');
  }
  return parsed;
}

function ftsQuery(value) {
  const tokens = String(value ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.slice(0, 12).map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ');
}

function nutrition(row) {
  return {
    calories: Number(row.calories_per_serving),
    protein: Number(row.protein_per_serving),
    carbs: Number(row.carbohydrate_per_serving),
    fat: Number(row.fat_per_serving),
  };
}

export class DataHiveRecipeProvider {
  constructor({ databasePath, expectedRows = 39447 } = {}) {
    this.databasePath = databasePath ?? process.env.RECIPE_DB_PATH ?? './data/recipes.sqlite';
    this.expectedRows = Number(expectedRows);
    if (!existsSync(this.databasePath)) {
      throw new RecipeCatalogError('The local recipe database has not been imported yet.');
    }
    try {
      this.database = new DatabaseSync(this.databasePath, { readOnly: true });
      this.database.exec('PRAGMA query_only = ON');
      const integrity = Object.values(this.database.prepare('PRAGMA quick_check').get() ?? {})[0];
      const total = Number(this.database.prepare('SELECT COUNT(*) AS count FROM recipes').get().count);
      const metadata = Object.fromEntries(this.database.prepare('SELECT key, value FROM metadata').all().map((row) => [row.key, row.value]));
      if (integrity !== 'ok' || total !== this.expectedRows || Number(metadata.row_count) !== this.expectedRows || metadata.provider !== 'datahive') {
        throw new Error('catalog validation failed');
      }
      this.total = total;
      this.facets = this.#loadFacets();
    } catch {
      this.database?.close();
      throw new RecipeCatalogError(`The recipe catalog must contain exactly ${this.expectedRows} validated DataHive recipes.`);
    }
  }

  #loadFacets() {
    return Object.fromEntries(FACETS.map(([kind, responseKey]) => [
      responseKey,
      this.database.prepare(
        'SELECT value, COUNT(DISTINCT recipe_id) AS count FROM recipe_labels WHERE kind = ? GROUP BY value ORDER BY value COLLATE NOCASE',
      ).all(kind).map((row) => ({ value: row.value, count: Number(row.count) })),
    ]));
  }

  #labels(recipeId) {
    const labels = {};
    for (const row of this.database.prepare(
      'SELECT kind, value FROM recipe_labels WHERE recipe_id = ? ORDER BY value COLLATE NOCASE',
    ).all(recipeId)) {
      (labels[row.kind] ??= []).push(row.value);
    }
    return labels;
  }

  #summary(row) {
    const labels = this.#labels(row.id);
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      imageUrl: row.image_url || '',
      servings: Number(row.servings),
      nutrition: nutrition(row),
      cuisine: labels.cuisine ?? [],
      dish: labels.dish ?? [],
      meal: labels.meal ?? [],
    };
  }

  getHealth() {
    return {
      status: 'ok',
      provider: 'datahive',
      configured: true,
      ready: true,
      total: this.total,
      expectedTotal: this.expectedRows,
    };
  }

  search(parameters) {
    const page = positiveInteger(parameters.get('page'), 1);
    const pageSize = positiveInteger(parameters.get('pageSize'), 12, 40);
    const clauses = [];
    const values = [];
    const search = ftsQuery(parameters.get('query'));
    if (search) {
      clauses.push('r.id IN (SELECT id FROM recipes_fts WHERE recipes_fts MATCH ?)');
      values.push(search);
    }
    const ingredientQueries = parameters.getAll('ingredient').map(ftsQuery).filter(Boolean).slice(0, 12);
    if (ingredientQueries.length) {
      clauses.push(`(${ingredientQueries.map(() => 'r.id IN (SELECT id FROM recipes_fts WHERE recipes_fts MATCH ?)').join(' OR ')})`);
      values.push(...ingredientQueries);
    }
    for (const [parameter, kind] of [['cuisine', 'cuisine'], ['dish', 'dish'], ['meal', 'meal'], ['diet', 'diet'], ['health', 'health']]) {
      const value = parameters.get(parameter)?.trim();
      if (value) {
        clauses.push('EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = ? AND l.value = ?)');
        values.push(kind, value);
      }
    }
    const minCalories = optionalNumber(parameters.get('minCalories'), 'minimum calories');
    const maxCalories = optionalNumber(parameters.get('maxCalories'), 'maximum calories');
    if (minCalories !== undefined) {
      clauses.push('r.calories_per_serving >= ?');
      values.push(minCalories);
    }
    if (maxCalories !== undefined) {
      clauses.push('r.calories_per_serving <= ?');
      values.push(maxCalories);
    }
    if (minCalories !== undefined && maxCalories !== undefined && minCalories > maxCalories) {
      throw new RecipeCatalogError('Minimum calories cannot exceed maximum calories.', 400, 'invalid_filter');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM recipes r ${where}`).get(...values).count);
    const rows = this.database.prepare(
      `SELECT r.* FROM recipes r ${where} ORDER BY r.title COLLATE NOCASE, r.id LIMIT ? OFFSET ?`,
    ).all(...values, pageSize, (page - 1) * pageSize);
    return {
      items: rows.map((row) => this.#summary(row)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      facets: this.facets,
    };
  }

  getRecipe(id) {
    const row = this.database.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    if (!row) throw new RecipeCatalogError('Recipe not found.', 404, 'recipe_not_found');
    const labels = this.#labels(id);
    const ingredientLines = this.database.prepare(
      'SELECT line FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position',
    ).all(id).map((item) => item.line);
    const nutrients = Object.fromEntries(this.database.prepare(
      'SELECT code, label, quantity_per_serving, unit, daily_percent_per_serving FROM recipe_nutrients WHERE recipe_id = ? ORDER BY label COLLATE NOCASE',
    ).all(id).map((item) => [item.code, {
      label: item.label,
      quantity: Number(item.quantity_per_serving),
      unit: item.unit,
      dailyPercent: number(item.daily_percent_per_serving),
    }]));
    return {
      ...this.#summary(row),
      url: row.source_url,
      diet: labels.diet ?? [],
      health: labels.health ?? [],
      cautions: labels.caution ?? [],
      ingredientLines,
      nutrients,
    };
  }
}

export function createRecipeProvider(environment = process.env) {
  return new DataHiveRecipeProvider({
    databasePath: environment.RECIPE_DB_PATH,
    expectedRows: Number(environment.RECIPE_EXPECTED_ROWS ?? 39447),
  });
}
