import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppConfiguration } from '../app.config.mjs';

test('application configuration centralizes edition and recipe photo switches', () => {
  const core = resolveAppConfiguration({ RECIPE_PHOTO_GENERATION_ENABLED: 'true' }, 'core');
  assert.deepEqual(core.features, { byokAi: false, recipePhotoGeneration: false, firebaseAnalytics: false });

  const byok = resolveAppConfiguration({}, 'byok');
  assert.equal(byok.features.byokAi, true);
  assert.equal(byok.features.recipePhotoGeneration, true);

  const disabled = resolveAppConfiguration({ RECIPE_PHOTO_GENERATION_ENABLED: 'false' }, 'byok');
  assert.equal(disabled.features.recipePhotoGeneration, false);

  const analytics = resolveAppConfiguration({
    VITE_FIREBASE_API_KEY: 'api',
    VITE_FIREBASE_PROJECT_ID: 'project',
    VITE_FIREBASE_APP_ID: 'app',
    VITE_FIREBASE_MEASUREMENT_ID: 'measurement',
  }, 'byok');
  assert.equal(analytics.features.firebaseAnalytics, true);
});

