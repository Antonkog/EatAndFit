export type UsdaPortion = {
  amount?: number;
  unit?: string;
  grams?: number;
  description?: string;
  modifier?: string;
};

export type UsdaNutrient = { name: string; unit: string; amount: number };

const fractionCharacters: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

function normalizeFractions(value: string) {
  return value.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (character) => ` ${fractionCharacters[character]} `).replace(/\s+/g, ' ').trim();
}

function fraction(value: string) {
  const [numerator, denominator] = value.split('/').map(Number);
  return denominator > 0 ? numerator / denominator : 0;
}

function quantityAtStart(value: string) {
  const normalized = normalizeFractions(value);
  const mixed = normalized.match(/^(\d+(?:\.\d+)?)\s+(\d+\/\d+)\b/);
  if (mixed) return { value: Number(mixed[1]) + fraction(mixed[2]), length: mixed[0].length };
  const simple = normalized.match(/^(\d+\/\d+|\d+(?:\.\d+)?)\b/);
  if (!simple) return { value: 1, length: 0 };
  return { value: simple[1].includes('/') ? fraction(simple[1]) : Number(simple[1]), length: simple[0].length };
}

export function ingredientSearchQuery(ingredient: string) {
  const base = normalizeFractions(ingredient).split(',')[0].trim();
  const quantity = quantityAtStart(base);
  return base
    .slice(quantity.length)
    .trim()
    .replace(/^(?:a|an)\s+/i, '')
    .replace(/^(?:(?:extra[ -])?(?:small|medium|large)|heaping|level|packed)\s+/i, '')
    .replace(/^(?:kg|kilograms?|g|grams?|oz|ounces?|lb|pounds?|cups?|tablespoons?|tbsp|teaspoons?|tsp|cloves?|slices?|pieces?|cans?|packages?)\s+(?:of\s+)?/i, '')
    .replace(/^(?:fresh|frozen|dried|chopped|diced|minced|sliced|crushed|peeled)\s+/i, '')
    .trim() || base;
}

export function suggestIngredientGrams(ingredient: string, portions: UsdaPortion[] = []) {
  const normalized = normalizeFractions(ingredient).toLocaleLowerCase('en-US');
  const quantity = quantityAtStart(normalized).value;
  const explicitWeight = normalized.match(/^(?:\d+\/\d+|\d+(?:\.\d+)?)(?:\s+\d+\/\d+)?\s*(kg|kilograms?|g|grams?|oz|ounces?|lb|pounds?)\b/);
  if (explicitWeight) {
    const factors: Record<string, number> = { kg: 1000, kilogram: 1000, kilograms: 1000, g: 1, gram: 1, grams: 1, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, pound: 453.592, pounds: 453.592 };
    return Math.round(quantity * factors[explicitWeight[1]] * 10) / 10;
  }

  const clues = ['extra small', 'small', 'medium', 'large', 'cup', 'tablespoon', 'tbsp', 'teaspoon', 'tsp', 'clove', 'slice', 'piece', 'can', 'package']
    .filter((clue) => normalized.includes(clue));
  const candidates = portions
    .filter((portion) => Number(portion.grams) > 0)
    .map((portion) => {
      const text = [portion.unit, portion.description, portion.modifier].filter(Boolean).join(' ').toLocaleLowerCase('en-US');
      return { portion, score: clues.reduce((score, clue) => score + (text.includes(clue) ? 1 : 0), 0) };
    })
    .sort((left, right) => right.score - left.score);
  const chosen = candidates[0];
  if (chosen && (chosen.score > 0 || candidates.length === 1)) {
    const portionAmount = Number(chosen.portion.amount) > 0 ? Number(chosen.portion.amount) : 1;
    return Math.round(quantity * Number(chosen.portion.grams) / portionAmount * 10) / 10;
  }
  return Math.round(quantity * 1000) / 10;
}

export function nutritionPerServing(nutrients: UsdaNutrient[], servings: number) {
  const divisor = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const find = (predicate: (name: string, unit: string) => boolean) => Number(nutrients.find((item) => predicate(item.name.toLocaleLowerCase('en-US'), item.unit.toLocaleLowerCase('en-US')))?.amount ?? 0) / divisor;
  const calories = find((name, unit) => name.includes('energy') && unit.includes('kcal'));
  const protein = find((name, unit) => name === 'protein' && unit === 'g');
  const carbs = find((name, unit) => name.includes('carbohydrate') && unit === 'g');
  const fat = find((name, unit) => (name.includes('total lipid') || name === 'total fat') && unit === 'g');
  return { calories, protein, carbs, fat };
}
