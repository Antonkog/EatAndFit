export const APP_CONFIG = typeof __APP_CONFIG__ === 'undefined'
  ? { edition: 'core' as const, providers: { meta: false, gemini: false }, credentials: { mode: 'none' as const, keySetup: false }, movement: { geminiModel: '' }, features: { byokAi: false, recipePhotoGeneration: false, firebaseAnalytics: false } }
  : __APP_CONFIG__;
export const BYOK_AI_ENABLED = APP_CONFIG.features.byokAi;
export const AI_CREDENTIAL_MODE = APP_CONFIG.credentials.mode;
export const AI_KEY_SETUP_ENABLED = APP_CONFIG.credentials.keySetup;
export const SERVER_MANAGED_AI = AI_CREDENTIAL_MODE === 'server' || AI_CREDENTIAL_MODE === 'hybrid';
export const HYBRID_AI_CREDENTIALS = AI_CREDENTIAL_MODE === 'hybrid';
export const RECIPE_PHOTO_GENERATION_ENABLED = APP_CONFIG.features.recipePhotoGeneration;
export const META_API_ENABLED = APP_CONFIG.providers.meta;
export const GEMINI_API_ENABLED = APP_CONFIG.providers.gemini;
export const GEMINI_MOVEMENT_MODEL = APP_CONFIG.movement.geminiModel;
export const ENABLED_AI_PROVIDER_LABEL = META_API_ENABLED && GEMINI_API_ENABLED
  ? 'Meta or Google Gemini'
  : META_API_ENABLED ? 'Meta' : GEMINI_API_ENABLED ? 'Google Gemini' : 'AI';
