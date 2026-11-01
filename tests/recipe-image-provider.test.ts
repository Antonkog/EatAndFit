import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachGeneratedRecipeImages,
  createRecipeImageGenerationProvider,
  GeminiRecipeImageGenerationProvider,
  MetaRecipeImageGenerationProvider,
} from '../src/ai/recipeImageProvider';
import { createApiServer } from '../server/api.mjs';
import { GeminiRecipeImageGenerationProvider as ServerGeminiProvider } from '../server/recipe-image-provider.mjs';

const recipe = (title: string) => ({
  title,
  description: `${title} description`,
  servings: 2,
  minutes: 20,
  ingredients: ['1 onion'],
  steps: ['Cook the onion.'],
  nutrition: { calories: 200, protein: 5, carbs: 30, fat: 6 },
});

test('recipe image provider factory selects exactly the configured provider', () => {
  assert.ok(createRecipeImageGenerationProvider({ provider: 'META', apiKey: 'meta-key' }) instanceof MetaRecipeImageGenerationProvider);
  assert.ok(createRecipeImageGenerationProvider({ provider: 'GEMINI', apiKey: 'gemini-key' }) instanceof GeminiRecipeImageGenerationProvider);
});

test('Meta recipe image provider requests Muse Image and returns a Blob', async () => {
  let request: any;
  const provider = new MetaRecipeImageGenerationProvider('private-key', async (url, init) => {
    assert.equal(url, 'https://api.meta.ai/v1/images/generations');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer private-key');
    request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }));
  });
  const result = await provider.generate(recipe('Soup'));
  assert.equal(request.model, 'muse-image-1.0');
  assert.equal(request.response_format, 'b64_json');
  assert.equal(request.output_format, 'webp');
  assert.match(request.prompt, /Soup/);
  assert.equal(await result.blob.text(), 'image');
  assert.equal(result.provider, 'META');
});

test('recipe image providers surface authentication, malformed output, and timeouts', async () => {
  const unauthorized = new MetaRecipeImageGenerationProvider('bad', async () => new Response(JSON.stringify({ error: {} }), { status: 401 }));
  await assert.rejects(() => unauthorized.generate(recipe('Soup')), /Wrong Meta API key/);

  const malformed = new MetaRecipeImageGenerationProvider('key', async () => new Response('{}'));
  await assert.rejects(() => malformed.generate(recipe('Soup')), /invalid image response/);

  const timeout = new ServerGeminiProvider({
    apiKey: 'key',
    fetchImpl: async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); },
  });
  await assert.rejects(() => timeout.generate(recipe('Soup')), /timed out/);
});

test('Gemini browser provider uses the same-origin endpoint', async () => {
  let requested = '';
  const provider = new GeminiRecipeImageGenerationProvider('private-key', async (url, init) => {
    requested = String(url);
    assert.equal(new Headers(init?.headers).get('x-recognition-provider'), 'GEMINI');
    return new Response(JSON.stringify({ imageBase64: Buffer.from('gemini-image').toString('base64'), mimeType: 'image/png', model: 'gemini-image' }));
  });
  const result = await provider.generate(recipe('Pasta'));
  assert.equal(requested, '/api/ai/recipes/image');
  assert.equal(await result.blob.text(), 'gemini-image');
  assert.equal(result.provider, 'GEMINI');
});

test('two recipe photos start concurrently and a failed image keeps its recipe', async () => {
  const pending: Array<{ resolve: (value: any) => void; reject: (error: Error) => void }> = [];
  const generation = attachGeneratedRecipeImages([recipe('One'), recipe('Two')], {
    generate: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  assert.equal(pending.length, 2);
  pending[0].resolve({ blob: new Blob(['one']), provider: 'META', model: 'model' });
  pending[1].reject(new Error('blocked'));
  const results = await generation;
  assert.equal(results[0].generatedImage?.model, 'model');
  assert.equal(results[1].title, 'Two');
  assert.equal(results[1].generatedImage, undefined);
});

test('Gemini server provider parses inline image data and maps safety failure', async () => {
  const provider = new ServerGeminiProvider({
    apiKey: 'private-key',
    fetchImpl: async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
      const request = JSON.parse(String(init.body));
      assert.equal(request.model, 'gemini-nano-banana-2.1');
      assert.equal(request.input[0].type, 'text');
      return new Response(JSON.stringify({ interaction: { output_image: { data: Buffer.from('photo').toString('base64'), mime_type: 'image/png' } } }));
    },
  });
  const result = await provider.generate(recipe('Curry'));
  assert.equal(Buffer.from(result.imageBase64, 'base64').toString(), 'photo');

  const blocked = new ServerGeminiProvider({ apiKey: 'key', fetchImpl: async () => new Response(JSON.stringify({ interaction: { status: 'blocked' } })) });
  await assert.rejects(() => blocked.generate(recipe('Blocked')), /blocked/);
});

test('recipe image API is enabled only for configured BYOK builds', async () => {
  const provider = { generate: async () => ({ imageBase64: Buffer.from('photo').toString('base64'), mimeType: 'image/png', provider: 'GEMINI', model: 'test' }) };
  const enabled = createApiServer({ edition: 'byok', recipePhotoGenerationEnabled: true, recipeImageProvider: provider });
  await new Promise<void>((resolve) => enabled.listen(0, '127.0.0.1', resolve));
  try {
    const address = enabled.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/recipes/image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipe: recipe('Soup') }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).model, 'test');
  } finally {
    await new Promise<void>((resolve, reject) => enabled.close((error) => error ? reject(error) : resolve()));
  }

  const disabled = createApiServer({ edition: 'byok', recipePhotoGenerationEnabled: false, recipeImageProvider: provider });
  await new Promise<void>((resolve) => disabled.listen(0, '127.0.0.1', resolve));
  try {
    const address = disabled.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/recipes/image`, { method: 'POST' });
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => disabled.close((error) => error ? reject(error) : resolve()));
  }
});

