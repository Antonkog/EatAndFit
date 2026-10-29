import assert from 'node:assert/strict';
import test from 'node:test';
import { readJsonResponse } from '../src/api/readJsonResponse';

test('readJsonResponse parses JSON API responses', async () => {
  const value = await readJsonResponse<{ ingredients: string[] }>(
    new Response(JSON.stringify({ ingredients: ['Onion', 'Garlic'] }), { status: 200 }),
    'Ingredient recognition',
  );
  assert.deepEqual(value.ingredients, ['Onion', 'Garlic']);
});

test('readJsonResponse replaces an HTML gateway error with a useful message', async () => {
  await assert.rejects(
    () => readJsonResponse(new Response('<html>Bad gateway</html>', { status: 502 }), 'Ingredient recognition'),
    /Ingredient recognition is temporarily unavailable\. Try again\./,
  );
});
