declare const __APP_CONFIG__: {
  edition: 'core' | 'byok';
  providers: {
    meta: boolean;
    gemini: boolean;
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
