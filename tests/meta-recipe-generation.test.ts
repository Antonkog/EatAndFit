import assert from 'node:assert/strict';
import test from 'node:test';
import { generateRecipesWithMeta } from '../src/ai/metaRecipeGeneration';

const recipe = (title: string) => ({
  title,
  description: `${title} description`,
  servings: 2,
  minutes: 20,
  ingredients: ['1 onion'],
  steps: ['Cook the onion.'],
  nutrition: { calories: 200, protein: 5, carbs: 30, fat: 6 },
});

test('browser Meta recipe generation retries models and validates two recipes', async () => {
  const models: string[] = [];
  const recipes = await generateRecipesWithMeta({ ingredients: 'onion, garlic' }, 'private-key', async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    models.push(request.model);
    if (models.length === 1) return new Response(JSON.stringify({ error: { code: 'model_not_found' } }), { status: 404 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recipes: [recipe('Soup'), recipe('Pasta')] }) } }] }), { status: 200 });
  });
  assert.deepEqual(models, ['muse-spark-1.3-contributor', 'muse-spark-1.3']);
  assert.deepEqual(recipes.map((item) => item.title), ['Soup', 'Pasta']);
});

test('browser Meta recipe generation rejects incomplete output', async () => {
  await assert.rejects(
    () => generateRecipesWithMeta({}, 'private-key', async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recipes: [recipe('Only one')] }) } }] }), { status: 200 })),
    /invalid recipe list/,
  );
});
