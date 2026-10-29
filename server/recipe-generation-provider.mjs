const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const META_API_BASE_URL = 'https://api.meta.ai/v1';

const nutritionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['calories', 'protein', 'carbs', 'fat'],
  properties: {
    calories: { type: 'number', minimum: 0 },
    protein: { type: 'number', minimum: 0 },
    carbs: { type: 'number', minimum: 0 },
    fat: { type: 'number', minimum: 0 },
  },
};

export const recipeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'servings', 'minutes', 'ingredients', 'steps', 'nutrition'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          description: { type: 'string', minLength: 1, maxLength: 500 },
          servings: { type: 'integer', minimum: 1, maximum: 20 },
          minutes: { type: 'integer', minimum: 1, maximum: 720 },
          ingredients: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'string', minLength: 1, maxLength: 160 } },
          steps: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 500 } },
          nutrition: nutritionSchema,
        },
      },
    },
  },
};

export class RecipeGenerationError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'RecipeGenerationError';
    this.status = status;
    this.code = code;
  }
}

function providerError(message, status, code) {
  return new RecipeGenerationError(message, status, code);
}

function parseTimeout(value) {
  return Math.min(Math.max(Number(value) || 45_000, 5_000), 120_000);
}

function isTimeout(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

function parseJson(text, provider) {
  if (typeof text !== 'string' || !text.trim()) throw providerError(`${provider} returned an empty response.`, 502, 'invalid_response');
  try {
    return JSON.parse(text);
  } catch {
    throw providerError(`${provider} returned invalid JSON.`, 502, 'invalid_response');
  }
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateGeneratedRecipes(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.recipes) || value.recipes.length !== 2) {
    throw providerError('The model returned an invalid recipe list.', 502, 'invalid_response');
  }
  for (const recipe of value.recipes) {
    const validStrings = (items, maximum) => Array.isArray(items) && items.length > 0 && items.length <= maximum && items.every((item) => typeof item === 'string' && item.trim());
    if (
      !recipe || typeof recipe !== 'object' ||
      typeof recipe.title !== 'string' || !recipe.title.trim() ||
      typeof recipe.description !== 'string' || !recipe.description.trim() ||
      !Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 20 ||
      !Number.isInteger(recipe.minutes) || recipe.minutes < 1 || recipe.minutes > 720 ||
      !validStrings(recipe.ingredients, 40) || !validStrings(recipe.steps, 30) ||
      !recipe.nutrition || !['calories', 'protein', 'carbs', 'fat'].every((key) => finiteNonNegative(recipe.nutrition[key]))
    ) {
      throw providerError('The model returned an invalid recipe.', 502, 'invalid_response');
    }
  }
  return value;
}

function generationPrompt(filters) {
  return [
    'Create exactly two practical recipes that satisfy the supplied preferences.',
    'Use concise English. Treat nutrition values as estimates per serving.',
    'Never include excluded ingredients or allergens.',
    `Preferences: ${JSON.stringify(filters ?? {})}`,
  ].join('\n');
}

export class RecipeGenerationProvider {
  async generate(filters) {
    return validateGeneratedRecipes(await this.request(filters));
  }

  async request(_filters) {
    throw new Error('RecipeGenerationProvider.request() must be implemented.');
  }
}

export class MetaRecipeGenerationProvider extends RecipeGenerationProvider {
  constructor({ apiKey = '', model = 'muse-spark-1.3', baseUrl = META_API_BASE_URL, fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model || 'muse-spark-1.3';
    this.baseUrl = (baseUrl || META_API_BASE_URL).replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = parseTimeout(timeoutMs);
  }

  async request(filters) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.6,
          messages: [
            { role: 'system', content: 'You are a careful recipe developer. Return strict JSON only.' },
            { role: 'user', content: generationPrompt(filters) },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'generated_recipes', strict: true, schema: recipeResponseSchema } },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) throw providerError('Meta request timed out.', 504, 'provider_timeout');
      throw providerError('Meta is temporarily unavailable.', 502, 'provider_unavailable');
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) throw providerError('Meta rate limit reached.', 429, 'rate_limited');
    if (body?.error?.code === 'content_policy_violation' || body?.choices?.[0]?.finish_reason === 'content_filter' || body?.choices?.[0]?.message?.refusal) {
      throw providerError('Meta blocked this request.', 422, 'content_blocked');
    }
    if (!response.ok) throw providerError('Meta request failed.', 502, 'provider_error');
    return parseJson(body?.choices?.[0]?.message?.content, 'Meta');
  }
}

export class GeminiRecipeGenerationProvider extends RecipeGenerationProvider {
  constructor({ apiKey = '', model = 'gemini-3.1-flash-lite', apiRoot = GEMINI_API_ROOT, fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model || 'gemini-3.1-flash-lite';
    this.apiRoot = apiRoot.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = parseTimeout(timeoutMs);
  }

  async request(filters) {
    let response;
    try {
      response = await this.fetch(`${this.apiRoot}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are a careful recipe developer. Return only the requested structured data.' }] },
          contents: [{ role: 'user', parts: [{ text: generationPrompt(filters) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: recipeResponseSchema,
            temperature: 0.6,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) throw providerError('Gemini request timed out.', 504, 'provider_timeout');
      throw providerError('Gemini is temporarily unavailable.', 502, 'provider_unavailable');
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) throw providerError('Gemini rate limit reached.', 429, 'rate_limited');
    const candidate = body?.candidates?.[0];
    if (body?.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') throw providerError('Gemini blocked this request.', 422, 'content_blocked');
    if (!response.ok) throw providerError('Gemini request failed.', 502, 'provider_error');
    const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    return parseJson(text, 'Gemini');
  }
}

export function createRecipeGenerationProvider(credentials = {}, options = {}) {
  const provider = String(credentials.provider || '').trim().toUpperCase();
  const apiKey = String(credentials.apiKey || '').trim();
  if (provider === 'META') return new MetaRecipeGenerationProvider({ apiKey, model: options.metaModel, baseUrl: options.metaBaseUrl, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
  if (provider === 'GEMINI') return new GeminiRecipeGenerationProvider({ apiKey, model: options.geminiModel, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
  throw providerError('Select Meta or Google Gemini in Settings.', 400, 'invalid_provider');
}

export async function generateRecipes(filters, provider, credentials) {
  return (provider ?? createRecipeGenerationProvider(credentials)).generate(filters);
}
