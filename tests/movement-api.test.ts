import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiServer } from '../server/api.mjs';

test('movement analysis is BYOK-only and passes the transient authorization request to its provider', async () => {
  let authorization = '';
  const byok = createApiServer({
    edition: 'byok',
    movementProvider: async (request: import('node:http').IncomingMessage) => {
      authorization = String(request.headers.authorization ?? '');
      return { ok: true };
    },
  });
  await new Promise<void>((resolve) => byok.listen(0, '127.0.0.1', resolve));
  try {
    const address = byok.address();
    if (!address || typeof address === 'string') throw new Error('No test server address.');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/movement/analyze`, { method: 'POST', headers: { authorization: 'Bearer device-meta-key' } });
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(authorization, 'Bearer device-meta-key');
  } finally {
    await new Promise<void>((resolve, reject) => byok.close((error) => error ? reject(error) : resolve()));
  }

  const core = createApiServer({ edition: 'core', movementProvider: async () => ({ ok: true }) });
  await new Promise<void>((resolve) => core.listen(0, '127.0.0.1', resolve));
  try {
    const address = core.address();
    if (!address || typeof address === 'string') throw new Error('No test server address.');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/movement/analyze`, { method: 'POST' });
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => core.close((error) => error ? reject(error) : resolve()));
  }
});
