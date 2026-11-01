import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrainingProvider } from '../server/training-provider.mjs';

test('Meta and Gemini training providers use only the explicitly selected provider', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const meta = createTrainingProvider({ provider: 'META', apiKey: 'meta-key' }, { fetchImpl: async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ goal: 'stay_fit', sessions: [] }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await meta.generate({ profile: {}, catalog: [] });
  assert.match(calls[0].url, /api\.meta\.ai/);
  assert.equal(calls[0].body.model, 'muse-spark-1.3-contributor');
  assert.equal(calls[0].body.response_format.json_schema.schema.properties.sessions.items.properties.exercises.items.properties.durationMinutes.type, 'integer');
  assert.match(calls[0].body.messages.at(-1).content, /whole integer from 1 to 60/);

  calls.length = 0;
  const gemini = createTrainingProvider({ provider: 'GEMINI', apiKey: 'gemini-key' }, { fetchImpl: async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ corrections: [] }) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await gemini.calibrate({ profile: {}, baselines: [] });
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(calls[0].url, /meta/);
});

test('provider key verification maps invalid credentials and succeeds without storing keys', async () => {
  const invalid = createTrainingProvider({ provider: 'META', apiKey: 'bad' }, { fetchImpl: async () => new Response(JSON.stringify({ error: {} }), { status: 401 }) });
  await assert.rejects(() => invalid.verify(), /Wrong API key/);
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const validMeta = createTrainingProvider({ provider: 'META', apiKey: 'good' }, { fetchImpl: async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 });
  } });
  assert.deepEqual(await validMeta.verify(), { ok: true, provider: 'META' });
  assert.match(requests[0].url, /\/v1\/models$/);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.body, undefined);
  const valid = createTrainingProvider({ provider: 'GEMINI', apiKey: 'good' }, { fetchImpl: async () => new Response('{}', { status: 200 }) });
  assert.deepEqual(await valid.verify(), { ok: true, provider: 'GEMINI' });
});
