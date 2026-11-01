import assert from 'node:assert/strict';
import test from 'node:test';
import { foodEntriesForBackup, isBackup } from '../src/data/db';

test('backup validation accepts only complete schema version one backups', () => {
  assert.equal(isBackup({ schemaVersion: 1, workouts: [], food: [], products: [], exportedAt: new Date().toISOString() }), true);
  assert.equal(isBackup({ schemaVersion: 2, workouts: [], food: [], products: [] }), false);
  assert.equal(isBackup({ schemaVersion: 1, workouts: [] }), false);
});

test('backup food entries exclude local generated-image references', () => {
  const [entry] = foodEntriesForBackup([{ id: 'food', date: '2026-11-02', title: 'Soup', provider: 'ai', localImageId: 'private-local-image' }]);
  assert.equal(entry.localImageId, undefined);
  assert.equal(entry.title, 'Soup');
});
