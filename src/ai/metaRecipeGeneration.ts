import { requestMetaChat, throwMetaRequestError } from './metaChat';
import type { AiRecipe } from './validation';

function finiteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validStrings(value: unknown, maximum: number) {
  return Array.isArray(value) && value.length > 0 && value.length <= maximum && value.every((item) => typeof item === 'string' && item.trim());
}

function validateRecipes(value: any): AiRecipe[] {
  if (!value || !Array.isArray(value.recipes) || value.recipes.length !== 2) throw new Error('Meta returned an invalid recipe list.');
  for (const recipe of value.recipes) {
    if (
      !recipe || typeof recipe !== 'object' ||
      typeof recipe.title !== 'string' || !recipe.title.trim() ||
      typeof recipe.description !== 'string' || !recipe.description.trim() ||
      !Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 20 ||
      !Number.isInteger(recipe.minutes) || recipe.minutes < 1 || recipe.minutes > 720 ||
      !validStrings(recipe.ingredients, 40) || !validStrings(recipe.steps, 30) ||
      !recipe.nutrition || !['calories', 'protein', 'carbs', 'fat'].every((key) => finiteNonNegative(recipe.nutrition[key]))
    ) throw new Error('Meta returned an invalid recipe.');
  }
  return value.recipes as AiRecipe[];
}

export async function generateRecipesWithMeta(
  filters: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
) {
  const prompt = [
    'Create exactly two practical recipes that satisfy the supplied preferences.',
    'Use concise English. Treat nutrition values as estimates per serving.',
    'Never include excluded ingredients or allergens.',
    'Return a JSON object with a recipes array. Each recipe must contain title, description, servings, minutes, ingredients, steps, and nutrition with calories, protein, carbs, and fat.',
    `Preferences: ${JSON.stringify(filters)}`,
  ].join('\n');

  const { response, body } = await requestMetaChat(apiKey, {
    temperature: 0.6,
    messages: [
      { role: 'system', content: 'You are a careful recipe developer. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  }, fetchImpl);

  throwMetaRequestError(response, body, 'recipe-generation');
  if (body?.choices?.[0]?.finish_reason === 'content_filter' || body?.choices?.[0]?.message?.refusal) throw new Error('Meta blocked this request.');

  let generated: any;
  try {
    generated = JSON.parse(body?.choices?.[0]?.message?.content ?? '');
  } catch {
    throw new Error('Meta returned an invalid recipe response.');
  }
  return validateRecipes(generated);
}
