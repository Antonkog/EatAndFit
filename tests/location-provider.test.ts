import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiServer } from '../server/api.mjs';
import { countryCodeFromLanguage, countryCodeToCuisine, isPublicIp, resolveCuisineLocation } from '../server/location-provider.mjs';

test('country codes map to existing DataHive cuisine facets', () => {
  assert.equal(countryCodeToCuisine('US'), 'american');
  assert.equal(countryCodeToCuisine('GE'), 'middle eastern');
  assert.equal(countryCodeToCuisine('JP'), 'japanese');
  assert.equal(countryCodeToCuisine('BR'), 'south american');
  assert.equal(countryCodeToCuisine('TH'), 'south east asian');
  assert.equal(countryCodeToCuisine('ES'), 'mediterranean');
  assert.equal(countryCodeToCuisine('ZZ'), 'world');
  assert.equal(countryCodeFromLanguage('ka-GE,ka;q=0.9,en;q=0.8'), 'GE');
});

test('location lookup uses only public addresses and falls back to browser language', async () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('192.168.1.10'), false);

  const remote = await resolveCuisineLocation({
    headers: { 'x-real-ip': '8.8.8.8', 'accept-language': 'ka-GE' }, socket: {},
  }, { fetchImpl: async () => new Response(JSON.stringify({ ip: '8.8.8.8', country: 'US' }), { status: 200 }) });
  assert.deepEqual(remote, { countryCode: 'US', cuisine: 'american', source: 'ip' });

  const privateAddress = await resolveCuisineLocation({
    headers: { 'x-real-ip': '10.0.0.4', 'accept-language': 'ka-GE,ka;q=0.9' }, socket: {},
  }, { fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(privateAddress, { countryCode: 'GE', cuisine: 'middle eastern', source: 'language' });

  const malformed = await resolveCuisineLocation({
    headers: { 'x-real-ip': '8.8.4.4', 'accept-language': 'fr-FR' }, socket: {},
  }, { fetchImpl: async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 }) });
  assert.deepEqual(malformed, { countryCode: 'FR', cuisine: 'french', source: 'language' });

  const failed = await resolveCuisineLocation({
    headers: { 'x-real-ip': '1.1.1.1' }, socket: {},
  }, { fetchImpl: async () => { throw new Error('timeout'); } });
  assert.deepEqual(failed, { countryCode: null, cuisine: 'world', source: 'fallback' });
});

test('location API returns only country, cuisine, and resolution source', async () => {
  const server = createApiServer({ locationProvider: async () => ({ countryCode: 'GE', cuisine: 'middle eastern', source: 'ip' }) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/location/cuisine`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { countryCode: 'GE', cuisine: 'middle eastern', source: 'ip' });
    assert.match(response.headers.get('cache-control') ?? '', /private/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
