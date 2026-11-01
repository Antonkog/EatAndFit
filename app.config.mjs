function booleanSetting(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

export function resolveAppConfiguration(environment = {}, requestedEdition = environment.APP_EDITION) {
  const edition = String(requestedEdition).trim().toLowerCase() === 'byok' ? 'byok' : 'core';
  const byokAi = edition === 'byok';
  const firebaseAnalytics = Boolean(
    environment.VITE_FIREBASE_API_KEY &&
    environment.VITE_FIREBASE_PROJECT_ID &&
    environment.VITE_FIREBASE_APP_ID &&
    environment.VITE_FIREBASE_MEASUREMENT_ID,
  );

  return Object.freeze({
    edition,
    features: Object.freeze({
      byokAi,
      recipePhotoGeneration: byokAi && booleanSetting(environment.RECIPE_PHOTO_GENERATION_ENABLED, true),
      firebaseAnalytics,
    }),
  });
}

