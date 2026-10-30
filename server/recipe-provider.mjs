import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const FACETS = [
  ['cuisine', 'cuisines'],
  ['dish', 'dishTypes'],
  ['meal', 'mealTypes'],
  ['diet', 'dietLabels'],
  ['health', 'healthLabels'],
];

const RECOMMENDATION_SLOTS = ['morning', 'afternoon', 'evening'];
const FILTER_PARAMETERS = ['query', 'ingredient', 'cuisine', 'dish', 'meal', 'diet', 'health', 'minCalories', 'maxCalories'];
const HEALTHY_LABELS = ['balanced', 'high-fiber', 'high-protein', 'low-fat', 'low-sodium'];
const MEAT_TERMS = ['chicken', 'turkey', 'beef', 'pork', 'lamb', 'veal', 'duck'];
const MORNING_EXCLUDED_TERMS = ['bourbon', 'cocktail', 'candy', 'cake', 'cookie', 'brownie', 'pops', 'ice cream', 'donut', 'doughnut'];

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

function recommendationInteger(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
    throw new RecipeCatalogError('Invalid recommendation variation.', 400, 'invalid_filter');
  }
  return parsed;
}

function recommendationDate(value) {
  const date = String(value ?? '');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RecipeCatalogError('Invalid recommendation date.', 400, 'invalid_filter');
  }
  return date;
}

function deterministicScore(seed, id) {
  return createHash('sha256').update(`${seed}:${id}`).digest('hex');
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

  #recommendationCandidates(slot, { cuisine, strict, excluded }) {
    const clauses = ['EXISTS (SELECT 1 FROM recipe_ingredients i WHERE i.recipe_id = r.id)'];
    const values = [];
    const ingredientLimit = strict ? (slot === 'afternoon' ? 12 : 10) : (slot === 'afternoon' ? 16 : 14);
    clauses.push('(SELECT COUNT(*) FROM recipe_ingredients i WHERE i.recipe_id = r.id) <= ?');
    values.push(ingredientLimit);
    if (strict) {
      clauses.push(`EXISTS (
        SELECT 1 FROM recipe_labels l
        WHERE l.recipe_id = r.id AND l.kind = 'diet' AND LOWER(l.value) IN (${HEALTHY_LABELS.map(() => '?').join(',')})
      )`);
      values.push(...HEALTHY_LABELS);
    }
    if (cuisine) {
      clauses.push("EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'cuisine' AND l.value = ?)");
      values.push(cuisine);
    }
    if (excluded.size) {
      clauses.push(`r.id NOT IN (${Array.from(excluded, () => '?').join(',')})`);
      values.push(...excluded);
    }

    if (slot === 'morning') {
      clauses.push('r.calories_per_serving BETWEEN 150 AND 500');
      clauses.push(`r.fat_per_serving <= ${strict ? 20 : 25}`);
      clauses.push("EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'meal' AND l.value IN ('breakfast', 'brunch'))");
      clauses.push("NOT EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'dish' AND l.value IN ('desserts', 'alcohol cocktail'))");
      clauses.push(MORNING_EXCLUDED_TERMS.map(() => 'LOWER(r.title) NOT LIKE ?').join(' AND '));
      values.push(...MORNING_EXCLUDED_TERMS.map((term) => `%${term}%`));
    } else if (slot === 'afternoon') {
      clauses.push('r.calories_per_serving BETWEEN 250 AND 600');
      clauses.push(`r.protein_per_serving >= ${strict ? 20 : 12}`);
      clauses.push("EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'meal' AND l.value = 'lunch/dinner')");
      clauses.push("EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'dish' AND l.value = 'main course')");
      clauses.push(`EXISTS (
        SELECT 1 FROM recipe_ingredients i WHERE i.recipe_id = r.id AND (${MEAT_TERMS.map(() => "LOWER(COALESCE(i.food, i.line)) LIKE ?").join(' OR ')})
      )`);
      values.push(...MEAT_TERMS.map((term) => `%${term}%`));
    } else {
      clauses.push('r.calories_per_serving BETWEEN 200 AND 550');
      clauses.push(`r.protein_per_serving >= ${strict ? 12 : 8}`);
      if (strict) clauses.push('r.fat_per_serving <= 25');
      clauses.push("EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'meal' AND l.value = 'lunch/dinner')");
      clauses.push("EXISTS (SELECT 1 FROM recipe_labels l WHERE l.recipe_id = r.id AND l.kind = 'dish' AND l.value IN ('main course', 'soup', 'salad'))");
    }

    return this.database.prepare(
      `SELECT r.* FROM recipes r WHERE ${clauses.join(' AND ')} ORDER BY r.id LIMIT 400`,
    ).all(...values);
  }

  #recommendations({ cuisine, date, variation }) {
    const knownCuisine = this.facets.cuisines.some((item) => item.value === cuisine) ? cuisine : undefined;
    const selected = [];
    const excluded = new Set();
    for (const slot of RECOMMENDATION_SLOTS) {
      const stages = [
        { cuisine: knownCuisine, strict: true },
        { cuisine: undefined, strict: true },
        { cuisine: knownCuisine, strict: false },
        { cuisine: undefined, strict: false },
      ].filter((stage, index, stages) => index === stages.findIndex((candidate) => candidate.cuisine === stage.cuisine && candidate.strict === stage.strict));
      let candidates = [];
      for (const stage of stages) {
        candidates = this.#recommendationCandidates(slot, { ...stage, excluded });
        if (candidates.length) break;
      }
      if (!candidates.length) continue;
      const seed = `${date}:${cuisine || 'world'}:${variation}:${slot}`;
      const row = candidates
        .map((candidate) => ({ candidate, score: deterministicScore(seed, candidate.id) }))
        .sort((left, right) => left.score.localeCompare(right.score))[0].candidate;
      excluded.add(row.id);
      selected.push({ ...this.#summary(row), recommendationSlot: slot });
    }
    return selected;
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
    const recommendationsEnabled = parameters.get('recommendations') === 'daily' && !FILTER_PARAMETERS.some((parameter) => parameters.has(parameter));
    const recommendations = recommendationsEnabled ? this.#recommendations({
      cuisine: String(parameters.get('recommendationCuisine') ?? '').trim().toLowerCase(),
      date: recommendationDate(parameters.get('recommendationDate')),
      variation: recommendationInteger(parameters.get('recommendationVariation')),
    }) : [];
    if (recommendations.length) {
      clauses.push(`r.id NOT IN (${recommendations.map(() => '?').join(',')})`);
      values.push(...recommendations.map((item) => item.id));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM recipes r ${where}`).get(...values).count);
    const resultOffset = (page - 1) * pageSize;
    const recommendationItems = recommendations.slice(resultOffset, resultOffset + pageSize);
    const normalOffset = Math.max(0, resultOffset - recommendations.length);
    const normalLimit = pageSize - recommendationItems.length;
    const rows = this.database.prepare(
      `SELECT r.* FROM recipes r ${where} ORDER BY r.title COLLATE NOCASE, r.id LIMIT ? OFFSET ?`,
    ).all(...values, normalLimit, normalOffset);
    const resultTotal = total + recommendations.length;
    return {
      items: [...recommendationItems, ...rows.map((row) => this.#summary(row))],
      page,
      pageSize,
      total: resultTotal,
      totalPages: Math.max(1, Math.ceil(resultTotal / pageSize)),
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
