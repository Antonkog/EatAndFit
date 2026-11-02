function booleanSetting(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

export function resolveAppConfiguration(environment = {}, requestedEdition = environment.APP_EDITION) {
  const edition = String(requestedEdition).trim().toLowerCase() === 'byok' ? 'byok' : 'core';
  const byokAi = edition === 'byok';
  const metaApi = byokAi && booleanSetting(environment.META_API_ENABLED, true);
  const geminiApi = byokAi && booleanSetting(environment.GEMINI_API_ENABLED, false);
  const firebaseAnalytics = Boolean(
    environment.VITE_FIREBASE_API_KEY &&
    environment.VITE_FIREBASE_PROJECT_ID &&
    environment.VITE_FIREBASE_APP_ID &&
    environment.VITE_FIREBASE_MEASUREMENT_ID,
  );

  return Object.freeze({
    edition,
    providers: Object.freeze({
      meta: metaApi,
      gemini: geminiApi,
    }),
    movement: Object.freeze({
      geminiModel: String(environment.GEMINI_MOVEMENT_MODEL ?? '').trim(),
    }),
    features: Object.freeze({
      byokAi,
      recipePhotoGeneration: (metaApi || geminiApi) && booleanSetting(environment.RECIPE_PHOTO_GENERATION_ENABLED, false),
      firebaseAnalytics,
    }),
  });
}

