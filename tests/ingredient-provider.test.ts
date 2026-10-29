import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createApiServer } from '../server/api.mjs';
import {
  createIngredientRecognitionProvider,
  detectIngredients,
  GeminiIngredientRecognitionProvider,
  IngredientRecognitionError,
  MetaIngredientRecognitionProvider,
  normalizeIngredientNames,
  validateIngredientImage,
} from '../server/ingredient-provider.mjs';

const JPEG_BASE64 = '/9j/2Q==';
const JPEG_DATA_URL = `data:image/jpeg;base64,${JPEG_BASE64}`;

function errorStatus(status: number, code?: string) {
  return (error: unknown) => error instanceof IngredientRecognitionError && error.status === status && (!code || error.code === code);
}

function metaResponse(ingredients: unknown = ['tomato']) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ingredients }) } }] }), { status: 200 });
}

test('creates exactly the user-selected provider from transient credentials', () => {
  assert.ok(createIngredientRecognitionProvider({ provider: 'META', apiKey: 'meta-key' }) instanceof MetaIngredientRecognitionProvider);
  assert.ok(createIngredientRecognitionProvider({ provider: 'GEMINI', apiKey: 'gemini-key' }) instanceof GeminiIngredientRecognitionProvider);
  assert.throws(() => createIngredientRecognitionProvider({ provider: 'FIREWORKS', apiKey: 'key' }), errorStatus(400, 'invalid_provider'));
});

test('validates JPEG data URLs and decoded size before provider dispatch', async () => {
  assert.equal(validateIngredientImage({ image: JPEG_DATA_URL }), JPEG_DATA_URL);
  assert.throws(() => validateIngredientImage({ image: 'data:image/png;base64,/9j/2Q==' }), errorStatus(415));
  assert.throws(() => validateIngredientImage({ image: 'data:image/jpeg;base64,not-base64' }), errorStatus(400));
  assert.throws(() => validateIngredientImage({ image: 'data:image/jpeg;base64,Zm9v' }), errorStatus(400));

  const oversized = Buffer.alloc(1024 * 1024 + 1, 1);
  oversized.set([0xff, 0xd8, 0xff], 0);
  oversized.set([0xff, 0xd9], oversized.length - 2);
  assert.throws(
    () => validateIngredientImage({ image: `data:image/jpeg;base64,${oversized.toString('base64')}` }),
    errorStatus(413, 'image_too_large'),
  );

  let dispatched = false;
  await assert.rejects(
    () => detectIngredients({ image: 'data:image/png;base64,/9j/2Q==' }, { detect: async () => { dispatched = true; return []; } }),
    errorStatus(415),
  );
  assert.equal(dispatched, false);
});

test('normalizes English ingredient names, duplicates, limits, and empty results', () => {
  const names = Array.from({ length: 40 }, (_, index) => `ingredient ${index}`);
  assert.deepEqual(normalizeIngredientNames([' tomato ', 'TOMATO', 'red   onion', '', 'картофель']), ['Tomato', 'Red onion']);
  assert.equal(normalizeIngredientNames(names).length, 30);
  assert.equal(normalizeIngredientNames(['x'.repeat(100)])[0].length, 80);
  assert.deepEqual(normalizeIngredientNames([]), []);
  assert.throws(() => normalizeIngredientNames([{}]), errorStatus(502, 'invalid_response'));
});

test('Meta sends the image with JSON output to chat completions and normalizes output', async () => {
  let requestedUrl = '';
  let requestedHeaders: Record<string, string> = {};
  let requestedBody: Record<string, any> = {};
  const provider = new MetaIngredientRecognitionProvider({
    apiKey: 'private-meta-key',
    model: 'muse-spark-1.3',
    baseUrl: 'https://meta.example/v1/',
    fetchImpl: async (url: string, init: RequestInit) => {
      requestedUrl = url;
      requestedHeaders = init.headers as Record<string, string>;
      requestedBody = JSON.parse(String(init.body));
      return metaResponse(['tomato', ' Tomato ', 'red onion']);
    },
  });

  assert.deepEqual(await provider.detect(JPEG_DATA_URL), ['Tomato', 'Red onion']);
  assert.equal(requestedUrl, 'https://meta.example/v1/chat/completions');
  assert.equal(requestedHeaders.Authorization, 'Bearer private-meta-key');
  assert.equal(requestedBody.model, 'muse-spark-1.3');
  assert.equal(requestedBody.messages[1].content[1].type, 'image_url');
  assert.equal(requestedBody.messages[1].content[1].image_url.url, JPEG_DATA_URL);
  assert.equal(requestedBody.response_format.type, 'json_object');
  assert.doesNotMatch(JSON.stringify(await provider.getHealth()), /private-meta-key/);
});

test('Meta defaults to the hackathon-accessible Muse Spark Contributor model', () => {
  const provider = new MetaIngredientRecognitionProvider({ apiKey: 'private-meta-key' });
  assert.equal(provider.getHealth().model, 'muse-spark-1.3-contributor');
});

test('Meta maps configuration, blocks, rate limits, timeouts, and malformed responses', async (context) => {
  const missing = new MetaIngredientRecognitionProvider();
  await assert.rejects(() => missing.detect(JPEG_DATA_URL), errorStatus(503, 'provider_not_configured'));

  const cases: Array<[string, () => Promise<Response>, number, string]> = [
    ['invalid key', async () => new Response(JSON.stringify({ error: { code: 'invalid_api_key' } }), { status: 401 }), 401, 'invalid_api_key'],
    ['missing model', async () => new Response(JSON.stringify({ error: { code: 'model_not_found' } }), { status: 404 }), 503, 'model_unavailable'],
    ['block', async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter' }] }), { status: 200 }), 422, 'content_blocked'],
    ['rate limit', async () => new Response('{}', { status: 429 }), 429, 'rate_limited'],
    ['malformed', async () => new Response(JSON.stringify({ choices: [{ message: { content: '{broken' } }] }), { status: 200 }), 502, 'invalid_response'],
    ['timeout', async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }, 504, 'provider_timeout'],
  ];
  for (const [name, fetchImpl, status, code] of cases) {
    await context.test(name, async () => {
      const provider = new MetaIngredientRecognitionProvider({ apiKey: 'key', fetchImpl });
      await assert.rejects(() => provider.detect(JPEG_DATA_URL), errorStatus(status, code));
    });
  }
});

test('Gemini retains generateContent transport, structured schema, and safety handling', async () => {
  let requestedUrl = '';
  let requestedHeaders: Record<string, string> = {};
  let requestedBody: Record<string, any> = {};
  const provider = new GeminiIngredientRecognitionProvider({
    apiKey: 'private-gemini-key',
    model: 'gemini-3.1-flash-lite',
    fetchImpl: async (url: string, init: RequestInit) => {
      requestedUrl = url;
      requestedHeaders = init.headers as Record<string, string>;
      requestedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ ingredients: [{ name: 'Tomato' }, { name: 'Red onion' }] }) }] } }] }), { status: 200 });
    },
  });

  assert.deepEqual(await provider.detect(JPEG_DATA_URL), ['Tomato', 'Red onion']);
  assert.match(requestedUrl, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(requestedHeaders['x-goog-api-key'], 'private-gemini-key');
  assert.equal(requestedBody.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
  assert.equal(requestedBody.contents[0].parts[0].inlineData.data, JPEG_BASE64);
  assert.equal(requestedBody.generationConfig.responseMimeType, 'application/json');
  assert.equal(requestedBody.generationConfig.temperature, 0.1);
  assert.ok(requestedBody.generationConfig.responseJsonSchema);

  const blocked = new GeminiIngredientRecognitionProvider({
    apiKey: 'key',
    fetchImpl: async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }),
  });
  await assert.rejects(() => blocked.detect(JPEG_DATA_URL), errorStatus(422, 'content_blocked'));
});

test('ingredient HTTP contract reports health, accepts Base64 capacity, and maps errors', async () => {
  let received = '';
  const provider = {
    getHealth: () => ({ provider: 'meta', model: 'muse-spark-1.3', configured: true }),
    detect: async (image: string) => { received = image; return ['Tomato']; },
  };
  const server = createApiServer({ edition: 'byok', ingredientProvider: provider });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    assert.deepEqual(await fetch(`${base}/api/ai/ingredients/healthz`).then((response) => response.json()), {
      ok: true,
      keySource: 'user-device',
      configured: false,
      supportedProviders: ['meta', 'gemini'],
    });

    const imageBytes = Buffer.alloc(300_000, 1);
    imageBytes.set([0xff, 0xd8, 0xff], 0);
    imageBytes.set([0xff, 0xd9], imageBytes.length - 2);
    const image = `data:image/jpeg;base64,${imageBytes.toString('base64')}`;
    const detected = await fetch(`${base}/api/ai/ingredients/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    });
    assert.equal(detected.status, 200);
    assert.deepEqual(await detected.json(), { ingredients: ['Tomato'] });
    assert.equal(received, image);

    const unsupported = await fetch(`${base}/api/ai/ingredients/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/png;base64,/9j/2Q==' }),
    });
    assert.equal(unsupported.status, 415);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  const coreServer = createApiServer({ edition: 'core' });
  await new Promise<void>((resolve) => coreServer.listen(0, '127.0.0.1', resolve));
  const coreAddress = coreServer.address();
  assert.ok(coreAddress && typeof coreAddress === 'object');
  try {
    const unavailable = await fetch(`http://127.0.0.1:${coreAddress.port}/api/ai/ingredients/healthz`);
    assert.equal(unavailable.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => coreServer.close((error) => error ? reject(error) : resolve()));
  }

  const limitedServer = createApiServer({
    edition: 'byok',
    ingredientProvider: {
      getHealth: provider.getHealth,
      detect: async () => { throw new IngredientRecognitionError('Meta rate limit reached.', 429, 'rate_limited'); },
    },
  });
  await new Promise<void>((resolve) => limitedServer.listen(0, '127.0.0.1', resolve));
  const limitedAddress = limitedServer.address();
  assert.ok(limitedAddress && typeof limitedAddress === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${limitedAddress.port}/api/ai/ingredients/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: JPEG_DATA_URL }),
    });
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'Meta rate limit reached.' });
  } finally {
    await new Promise<void>((resolve, reject) => limitedServer.close((error) => error ? reject(error) : resolve()));
  }

  const byokServer = createApiServer({ edition: 'byok' });
  await new Promise<void>((resolve) => byokServer.listen(0, '127.0.0.1', resolve));
  const byokAddress = byokServer.address();
  assert.ok(byokAddress && typeof byokAddress === 'object');
  try {
    const missingKey = await fetch(`http://127.0.0.1:${byokAddress.port}/api/ai/ingredients/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: JPEG_DATA_URL }),
    });
    assert.equal(missingKey.status, 401);
    assert.deepEqual(await missingKey.json(), { error: 'Add an API key in Settings before using Smart Scan.' });

    const invalidProvider = await fetch(`http://127.0.0.1:${byokAddress.port}/api/ai/ingredients/detect`, {
      method: 'POST',
      headers: { Authorization: 'Bearer user-key', 'Content-Type': 'application/json', 'X-Recognition-Provider': 'FIREWORKS' },
      body: JSON.stringify({ image: JPEG_DATA_URL }),
    });
    assert.equal(invalidProvider.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => byokServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('BYOK settings explain encrypted local keys and both recognition providers', () => {
  const source = readFileSync(new URL('../src/settings/SettingsView.tsx', import.meta.url), 'utf8');
  assert.match(source, /Meta API key/);
  assert.match(source, /Google Gemini API key/);
  assert.match(source, /AES-GCM/);
  assert.match(source, /non-exportable encryption key/);
  assert.match(source, /not stored by Eat & Fit/);
  assert.match(source, /Legal, data sources &amp; safety/);
});

test('smart scanner sends the selected device key only with a cloud request', () => {
  const source = readFileSync(new URL('../src/scanner/ScanView.tsx', import.meta.url), 'utf8');
  const coreSource = readFileSync(new URL('../src/scanner/CoreScanView.tsx', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/ai\/ingredients\/detect'/);
  assert.match(source, /authorization: `Bearer \$\{recognition\.apiKey\}`/);
  assert.match(source, /x-recognition-provider/);
  assert.doesNotMatch(source, /Recognition mode|recognitionMode|On-device|YOLOE/);
  assert.match(source, /title="Photo"/);
  assert.match(source, /title="Barcode"/);
  assert.doesNotMatch(coreSource, /Photo|ingredients\/detect|secureKeys/);
  assert.match(coreSource, /ProductScanner/);
});
