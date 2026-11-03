declare const __APP_CONFIG__: {
  edition: 'core' | 'byok';
  providers: {
    meta: boolean;
    gemini: boolean;
  };
  credentials: {
    mode: 'none' | 'byok' | 'server' | 'hybrid';
    keySetup: boolean;
  };
  movement: {
    geminiModel: string;
  };
  features: {
    byokAi: boolean;
    recipePhotoGeneration: boolean;
    firebaseAnalytics: boolean;
  };
};
