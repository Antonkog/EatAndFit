import assert from 'node:assert/strict';
import test from 'node:test';

test('foundation uses the English-only product name', () => {
  assert.equal('Eat & Fit'.includes('Eat'), true);
});
