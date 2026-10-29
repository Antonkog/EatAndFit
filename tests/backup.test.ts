import assert from 'node:assert/strict';
import test from 'node:test';
import { isBackup } from '../src/data/db';

test('backup validation accepts only complete schema version one backups', () => {
  assert.equal(isBackup({ schemaVersion: 1, workouts: [], food: [], products: [], exportedAt: new Date().toISOString() }), true);
  assert.equal(isBackup({ schemaVersion: 2, workouts: [], food: [], products: [] }), false);
  assert.equal(isBackup({ schemaVersion: 1, workouts: [] }), false);
});
