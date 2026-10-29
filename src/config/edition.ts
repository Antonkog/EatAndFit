export type AppEdition = 'CORE' | 'BYOK';

export const APP_EDITION: AppEdition = __SMART_SCANNER__ ? 'BYOK' : 'CORE';
export const SMART_SCANNER_ENABLED = __SMART_SCANNER__;
export const APP_EDITION_LABEL = SMART_SCANNER_ENABLED ? 'Free · Bring your own key' : 'Free';
