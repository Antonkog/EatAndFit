import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppConfiguration } from '../app.config.mjs';

test('application configuration centralizes edition and recipe photo switches', () => {
  const core = resolveAppConfiguration({ RECIPE_PHOTO_GENERATION_ENABLED: 'true' }, 'core');
  assert.deepEqual(core.features, { byokAi: false, recipePhotoGeneration: false, firebaseAnalytics: false });
  assert.deepEqual(core.providers, { meta: false, gemini: false });

  const byok = resolveAppConfiguration({}, 'byok');
  assert.equal(byok.features.byokAi, true);
  assert.equal(byok.features.recipePhotoGeneration, false);
  assert.deepEqual(byok.providers, { meta: true, gemini: false });
  assert.deepEqual(byok.credentials, { mode: 'hybrid', keySetup: true });

  const serverOnly = resolveAppConfiguration({ AI_CREDENTIAL_MODE: 'server' }, 'byok');
  assert.deepEqual(serverOnly.credentials, { mode: 'server', keySetup: false });

  const bothProviders = resolveAppConfiguration({ AI_CREDENTIAL_MODE: 'byok', META_API_ENABLED: 'true', GEMINI_API_ENABLED: 'true' }, 'byok');
  assert.deepEqual(bothProviders.providers, { meta: true, gemini: true });
  assert.deepEqual(bothProviders.credentials, { mode: 'byok', keySetup: true });

  const geminiMovement = resolveAppConfiguration({ GEMINI_MOVEMENT_MODEL: 'gemini-future-video' }, 'byok');
  assert.equal(geminiMovement.movement.geminiModel, 'gemini-future-video');
  assert.equal(byok.movement.geminiModel, '');

  const geminiOnly = resolveAppConfiguration({ AI_CREDENTIAL_MODE: 'byok', META_API_ENABLED: 'false', GEMINI_API_ENABLED: 'true' }, 'byok');
  assert.deepEqual(geminiOnly.providers, { meta: false, gemini: true });

  const disabled = resolveAppConfiguration({ RECIPE_PHOTO_GENERATION_ENABLED: 'false' }, 'byok');
  assert.equal(disabled.features.recipePhotoGeneration, false);

  const explicitlyEnabled = resolveAppConfiguration({ AI_CREDENTIAL_MODE: 'byok', RECIPE_PHOTO_GENERATION_ENABLED: 'true' }, 'byok');
  assert.equal(explicitlyEnabled.features.recipePhotoGeneration, true);

  const noProvider = resolveAppConfiguration({ META_API_ENABLED: 'false', GEMINI_API_ENABLED: 'false' }, 'byok');
  assert.equal(noProvider.features.recipePhotoGeneration, false);

  const analytics = resolveAppConfiguration({
    VITE_FIREBASE_API_KEY: 'api',
    VITE_FIREBASE_PROJECT_ID: 'project',
    VITE_FIREBASE_APP_ID: 'app',
    VITE_FIREBASE_MEASUREMENT_ID: 'measurement',
  }, 'byok');
  assert.equal(analytics.features.firebaseAnalytics, true);
});

