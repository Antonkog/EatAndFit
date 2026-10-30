import assert from 'node:assert/strict';
import test from 'node:test';
import { legalSources } from '../src/settings/legal';

test('settings identify all external data sources and licenses', () => {
  assert.equal(legalSources.length, 8);
  assert.match(legalSources.find((item) => item.title === 'Recipe catalog')!.license, /NC/);
  assert.match(legalSources.find((item) => item.title === 'Nutrition data')!.license, /CC0/);
  const joined = legalSources.map((item) => `${item.title} ${item.license} ${item.body}`).join(' ');
  assert.match(joined, /2024 Adult Compendium/);
  assert.match(joined, /Older Adult Compendium/);
  assert.match(joined, /Youth Compendium/);
  assert.match(joined, /Harvard/);
});
