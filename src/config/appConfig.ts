export const APP_CONFIG = typeof __APP_CONFIG__ === 'undefined'
  ? { edition: 'core' as const, features: { byokAi: false, recipePhotoGeneration: false, firebaseAnalytics: false } }
  : __APP_CONFIG__;
export const BYOK_AI_ENABLED = APP_CONFIG.features.byokAi;
export const RECIPE_PHOTO_GENERATION_ENABLED = APP_CONFIG.features.recipePhotoGeneration;
