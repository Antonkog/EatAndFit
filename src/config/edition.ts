import { APP_CONFIG, BYOK_AI_ENABLED } from './appConfig';

export type AppEdition = 'CORE' | 'BYOK';

export const APP_EDITION: AppEdition = APP_CONFIG.edition === 'byok' ? 'BYOK' : 'CORE';
export const SMART_SCANNER_ENABLED = BYOK_AI_ENABLED;
export const APP_EDITION_LABEL = SMART_SCANNER_ENABLED ? 'Free · Bring your own key' : 'Free';
