import assert from 'node:assert/strict';
import test from 'node:test';
import { recognizeIngredientsWithMeta } from '../src/scanner/metaRecognition';

test('browser Meta recognition requests every visible ingredient with the Contributor model', async () => {
  let requestedUrl = '';
  let requestedBody: any;
  const ingredients = await recognizeIngredientsWithMeta(
    'data:image/jpeg;base64,/9j/2Q==',
    'private-key',
    async (url, init) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ ingredients: ['onion', 'garlic', ' Onion '] }) } }],
      }), { status: 200 });
    },
  );

  assert.equal(requestedUrl, 'https://api.meta.ai/v1/chat/completions');
  assert.equal(requestedBody.model, 'muse-spark-1.3-contributor');
  assert.match(requestedBody.messages[1].content[0].text, /all distinct edible ingredients/);
  assert.equal(requestedBody.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,/9j/2Q==');
  assert.equal(requestedBody.response_format.type, 'json_object');
  assert.deepEqual(ingredients, ['Onion', 'Garlic']);
});

test('browser Meta recognition reports provider errors clearly', async () => {
  await assert.rejects(
    () => recognizeIngredientsWithMeta('data:image/jpeg;base64,/9j/2Q==', 'bad-key', async () => new Response(JSON.stringify({ error: { code: 'invalid_api_key' } }), { status: 401 })),
    /Wrong Meta API key\./,
  );
});
