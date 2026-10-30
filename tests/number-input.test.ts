import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldSelectZeroNumberInput } from '../src/ui/numberInput';

test('numeric zero is selected while nonzero, empty, and unavailable inputs are untouched', () => {
  assert.equal(shouldSelectZeroNumberInput('number', '0'), true);
  assert.equal(shouldSelectZeroNumberInput('number', '0.0'), true);
  assert.equal(shouldSelectZeroNumberInput('number', '-0'), true);
  assert.equal(shouldSelectZeroNumberInput('number', ''), false);
  assert.equal(shouldSelectZeroNumberInput('number', '12'), false);
  assert.equal(shouldSelectZeroNumberInput('text', '0'), false);
  assert.equal(shouldSelectZeroNumberInput('number', '0', true), false);
  assert.equal(shouldSelectZeroNumberInput('number', '0', false, true), false);
});

test('application-shell capture covers dialogs and restores mobile selection after pointer placement', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /onFocusCapture/);
  assert.match(app, /onBeforeInputCapture/);
  assert.match(app, /onPointerUpCapture/);
  assert.match(app, /requestAnimationFrame/);
  assert.doesNotMatch(app, /<main className="page" onFocus=/);
});
