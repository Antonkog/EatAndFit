import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decryptSecret, encryptSecret } from '../src/settings/secureKeys';

test('device secrets use authenticated encryption and do not contain plaintext', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const encrypted = await encryptSecret('user-supplied-private-key', key);
  assert.doesNotMatch(JSON.stringify(encrypted), /user-supplied-private-key/);
  assert.equal(await decryptSecret(encrypted, key), 'user-supplied-private-key');
  await assert.rejects(() => crypto.subtle.exportKey('raw', key));
});

test('build editions keep key-dependent features out of Core navigation', () => {
  const edition = readFileSync(new URL('../src/config/edition.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const recipe = readFileSync(new URL('../src/recipes/RecipeView.tsx', import.meta.url), 'utf8');
  assert.match(edition, /__SMART_SCANNER__/);
  assert.match(app, /lazy\(\(\) => import\('\.\/scanner\/ScanView'\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/ai\/AiRecipeBuilder'\)/);
  assert.match(recipe, /__SMART_SCANNER__ && onOpenAi/);
  assert.match(recipe, /Generate AI recipe/);
});
