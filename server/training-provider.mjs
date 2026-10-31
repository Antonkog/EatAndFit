const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const META_API_BASE_URL = 'https://api.meta.ai/v1';

export class TrainingProviderError extends Error {
  constructor(message, status = 502, code = 'provider_error') {
    super(message);
    this.name = 'TrainingProviderError';
    this.status = status;
    this.code = code;
  }
}

const planSchema = {
  type: 'object', additionalProperties: false, required: ['goal', 'sessions'],
  properties: {
    goal: { type: 'string', enum: ['lose_weight', 'build_muscle', 'stay_fit'] },
    sessions: { type: 'array', minItems: 6, maxItems: 6, items: {
      type: 'object', additionalProperties: false, required: ['title', 'exercises'],
      properties: {
        title: { type: 'string' },
        exercises: { type: 'array', minItems: 5, maxItems: 7, items: {
          type: 'object', additionalProperties: false, required: ['exerciseId', 'sets'],
          properties: { exerciseId: { type: 'string' }, sets: { type: 'integer', minimum: 1, maximum: 8 }, reps: { type: 'integer', minimum: 0, maximum: 100 }, durationMinutes: { type: 'integer', minimum: 1, maximum: 60 } },
        } },
      },
    } },
  },
};

const calibrationSchema = {
  type: 'object', additionalProperties: false, required: ['corrections'],
  properties: { corrections: { type: 'array', minItems: 5, maxItems: 5, items: {
    type: 'object', additionalProperties: false, required: ['exerciseId', 'calories'], properties: { exerciseId: { type: 'string' }, calories: { type: 'number', minimum: 0 } },
  } } },
};

function parseJson(text, provider) {
  try { return JSON.parse(text); }
  catch { throw new TrainingProviderError(`${provider} returned invalid JSON.`, 502, 'invalid_response'); }
}

function planPrompt(input) {
  return `Create a conservative two-week adult gym plan. Use only supplied exercise IDs. Return exactly six sessions with 5–7 exercises each, 1–8 sets, and repetitions or estimated activity minutes per set. Every durationMinutes value must be a whole integer from 1 to 60. Return JSON only. Input: ${JSON.stringify(input)}`;
}

function calibrationPrompt(input) {
  return `Conservatively calibrate these five source-based exercise calorie estimates for the supplied adult profile. Return exactly one correction per exerciseId, each within 50–150% of its baseline. Return JSON only. Input: ${JSON.stringify(input)}`;
}

export class TrainingProvider {
  constructor({ provider, apiKey, fetchImpl = fetch, model, baseUrl } = {}) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async request(prompt, schema, schemaName) {
    if (this.provider === 'META') {
      const response = await this.fetch(`${(this.baseUrl || META_API_BASE_URL).replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model || 'muse-spark-1.3-contributor', temperature: 0.2, messages: [{ role: 'system', content: 'Return strict JSON only.' }, { role: 'user', content: prompt }], response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } } }),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => { throw new TrainingProviderError('Meta is temporarily unavailable.', 502, 'provider_unavailable'); });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new TrainingProviderError('Wrong Meta API key.', 401, 'invalid_api_key');
      if (response.status === 429) throw new TrainingProviderError('Meta rate limit reached.', 429, 'rate_limited');
      if (!response.ok) throw new TrainingProviderError(body?.error?.message || 'Meta training request failed.', response.status || 502);
      return parseJson(body?.choices?.[0]?.message?.content ?? '', 'Meta');
    }
    const response = await this.fetch(`${GEMINI_API_ROOT}/${encodeURIComponent(this.model || 'gemini-3.1-flash-lite')}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2, maxOutputTokens: 8192 } }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => { throw new TrainingProviderError('Gemini is temporarily unavailable.', 502, 'provider_unavailable'); });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) throw new TrainingProviderError('Wrong Google Gemini API key.', 401, 'invalid_api_key');
    if (response.status === 429) throw new TrainingProviderError('Gemini rate limit reached.', 429, 'rate_limited');
    if (!response.ok) throw new TrainingProviderError('Gemini training request failed.', response.status || 502);
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    return parseJson(text, 'Gemini');
  }

  generate(input) { return this.request(planPrompt(input), planSchema, 'training_plan'); }
  calibrate(input) { return this.request(calibrationPrompt(input), calibrationSchema, 'energy_calibration'); }
  async verify() {
    if (this.provider === 'META') {
      const models = this.model ? [this.model] : ['muse-spark-1.3-contributor', 'muse-spark-1.3'];
      for (const model of models) {
        const response = await this.fetch(`${(this.baseUrl || META_API_BASE_URL).replace(/\/$/, '')}/chat/completions`, {
          method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: 'Reply OK.' }] }),
          signal: AbortSignal.timeout(20_000),
        }).catch(() => { throw new TrainingProviderError('Meta is temporarily unavailable.', 502, 'provider_unavailable'); });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) throw new TrainingProviderError('Wrong API key', 401, 'invalid_api_key');
        if (response.status === 404 && body?.error?.code === 'model_not_found') continue;
        if (!response.ok) throw new TrainingProviderError(body?.error?.message || 'Meta key verification failed.', response.status || 502);
        return { ok: true, provider: 'META' };
      }
      throw new TrainingProviderError('The Meta AI model is not available for this API key.', 503, 'model_unavailable');
    }
    const response = await this.fetch(`${GEMINI_API_ROOT}/${encodeURIComponent(this.model || 'gemini-3.1-flash-lite')}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply OK.' }] }], generationConfig: { maxOutputTokens: 1, temperature: 0 } }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => { throw new TrainingProviderError('Gemini is temporarily unavailable.', 502, 'provider_unavailable'); });
    if (response.status === 400 || response.status === 401 || response.status === 403) throw new TrainingProviderError('Wrong API key', 401, 'invalid_api_key');
    if (!response.ok) throw new TrainingProviderError('Gemini key verification failed.', response.status || 502);
    return { ok: true, provider: 'GEMINI' };
  }
}

export function createTrainingProvider(credentials = {}, options = {}) {
  const provider = String(credentials.provider || '').trim().toUpperCase();
  if (provider !== 'META' && provider !== 'GEMINI') throw new TrainingProviderError('Select Meta or Google Gemini in Settings.', 400, 'invalid_provider');
  return new TrainingProvider({ provider, apiKey: String(credentials.apiKey || ''), fetchImpl: options.fetchImpl, model: provider === 'META' ? options.metaModel : options.geminiModel, baseUrl: options.metaBaseUrl });
}

export async function generateTrainingPlan(input, provider, credentials) {
  return (provider ?? createTrainingProvider(credentials)).generate(input);
}

export async function calibrateTrainingEnergy(input, provider, credentials) {
  return (provider ?? createTrainingProvider(credentials)).calibrate(input);
}

export async function verifyAiCredential(provider, credentials) {
  return (provider ?? createTrainingProvider(credentials)).verify();
}
