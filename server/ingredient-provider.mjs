const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const META_API_BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_META_MODEL = 'muse-spark-1.3-contributor';

export const RecognitionModelProvider = Object.freeze({
  META: 'META',
  GEMINI: 'GEMINI',
});

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_INGREDIENTS = 30;
export const MAX_INGREDIENT_NAME_LENGTH = 80;
export const INGREDIENT_REQUEST_BODY_LIMIT = 1450 * 1024;

const recognitionPrompt =
  'Identify only the distinct edible ingredients clearly visible in this image. Return concise common English names without quantities, recipes, confidence scores, or ingredients that are hidden or merely implied. Return an empty list when none are identifiable.';

export const geminiResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ingredients'],
  properties: {
    ingredients: {
      type: 'array',
      maxItems: MAX_INGREDIENTS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: MAX_INGREDIENT_NAME_LENGTH },
        },
      },
    },
  },
};

export class IngredientRecognitionError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'IngredientRecognitionError';
    this.status = status;
    this.code = code;
  }
}

function recognitionError(message, status, code) {
  return new IngredientRecognitionError(message, status, code);
}

function parseTimeout(value) {
  return Math.min(Math.max(Number(value) || 45_000, 5_000), 120_000);
}

function isTimeout(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

function parseJsonText(text, provider) {
  if (typeof text !== 'string' || !text.trim()) {
    throw recognitionError(`${provider} returned an empty response.`, 502, 'invalid_response');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw recognitionError(`${provider} returned invalid JSON.`, 502, 'invalid_response');
  }
}

export function validateIngredientImage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw recognitionError('Request body must be a JSON object.', 400, 'invalid_request');
  }
  if (Object.keys(payload).some((key) => key !== 'image') || typeof payload.image !== 'string') {
    throw recognitionError('Request must contain only an image data URL.', 400, 'invalid_request');
  }
  const prefix = 'data:image/jpeg;base64,';
  if (!payload.image.startsWith(prefix)) {
    throw recognitionError('Only JPEG image data URLs are supported.', 415, 'unsupported_image');
  }
  const encoded = payload.image.slice(prefix.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw recognitionError('Image data must be valid Base64.', 400, 'invalid_image');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw recognitionError('Image must not exceed 1 MiB.', 413, 'image_too_large');
  }
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    throw recognitionError('Image data is not a valid JPEG.', 400, 'invalid_image');
  }
  return payload.image;
}

export function normalizeIngredientNames(value) {
  if (!Array.isArray(value)) {
    throw recognitionError('Recognition provider returned an invalid ingredient list.', 502, 'invalid_response');
  }
  const ingredients = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string') {
      throw recognitionError('Recognition provider returned an invalid ingredient name.', 502, 'invalid_response');
    }
    const compact = item.replace(/\s+/g, ' ').trim();
    if (!compact) continue;
    const name = compact.slice(0, MAX_INGREDIENT_NAME_LENGTH).trim();
    if (!/[\p{Script=Latin}]/u.test(name)) continue;
    const canonical = name.toLocaleLowerCase('en-US');
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    ingredients.push(name.charAt(0).toLocaleUpperCase('en-US') + name.slice(1));
    if (ingredients.length === MAX_INGREDIENTS) break;
  }
  return ingredients;
}

export class IngredientRecognitionProvider {
  getHealth() {
    throw new Error('IngredientRecognitionProvider.getHealth() must be implemented.');
  }

  async detect(image) {
    return normalizeIngredientNames(await this.recognize(image));
  }

  async recognize(_image) {
    throw new Error('IngredientRecognitionProvider.recognize() must be implemented.');
  }
}

export class GeminiIngredientRecognitionProvider extends IngredientRecognitionProvider {
  constructor({ apiKey = '', model = 'gemini-3.1-flash-lite', fetchImpl = fetch, timeoutMs = 45_000, apiRoot = GEMINI_API_ROOT } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model || 'gemini-3.1-flash-lite';
    this.fetch = fetchImpl;
    this.timeoutMs = parseTimeout(timeoutMs);
    this.apiRoot = apiRoot.replace(/\/$/, '');
  }

  getHealth() {
    return { provider: 'gemini', model: this.model, configured: Boolean(this.apiKey) };
  }

  async recognize(image) {
    if (!this.apiKey) {
      throw recognitionError('Gemini ingredient recognition is not configured.', 503, 'provider_not_configured');
    }
    const encoded = image.slice('data:image/jpeg;base64,'.length);
    let response;
    try {
      response = await this.fetch(`${this.apiRoot}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'Identify only visible edible ingredients. Return canonical English names without quantities, recipes, or confidence scores.' }],
          },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: encoded } },
              { text: 'List the distinct food ingredients clearly visible in this image. Return an empty list when none are identifiable.' },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: geminiResponseSchema,
            temperature: 0.1,
            maxOutputTokens: 512,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) throw recognitionError('Gemini request timed out.', 504, 'provider_timeout');
      throw recognitionError('Gemini is temporarily unavailable.', 502, 'provider_unavailable');
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) throw recognitionError('Gemini rate limit reached.', 429, 'rate_limited');
    if (!response.ok) throw recognitionError('Gemini request failed.', 502, 'provider_error');
    const candidate = body?.candidates?.[0];
    if (body?.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') {
      throw recognitionError('Gemini blocked this image.', 422, 'content_blocked');
    }
    if (!candidate) throw recognitionError('Gemini returned an invalid response.', 502, 'invalid_response');
    const text = candidate.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    const generated = parseJsonText(text, 'Gemini');
    if (!generated || typeof generated !== 'object' || !Array.isArray(generated.ingredients)) {
      throw recognitionError('Gemini returned an invalid ingredient list.', 502, 'invalid_response');
    }
    return generated.ingredients.map((item) => {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') {
        throw recognitionError('Gemini returned an invalid ingredient.', 502, 'invalid_response');
      }
      return item.name;
    });
  }
}

export class MetaIngredientRecognitionProvider extends IngredientRecognitionProvider {
  constructor({ apiKey = '', model = DEFAULT_META_MODEL, baseUrl = META_API_BASE_URL, fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model || DEFAULT_META_MODEL;
    this.baseUrl = (baseUrl || META_API_BASE_URL).replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = parseTimeout(timeoutMs);
  }

  getHealth() {
    return { provider: 'meta', model: this.model, configured: Boolean(this.apiKey) };
  }

  async recognize(image) {
    if (!this.apiKey) {
      throw recognitionError('Meta ingredient recognition is not configured.', 503, 'provider_not_configured');
    }
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: 'system', content: 'You identify visible food ingredients and return strict JSON only.' },
            { role: 'user', content: [{ type: 'text', text: recognitionPrompt }, { type: 'image_url', image_url: { url: image } }] },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) throw recognitionError('Meta request timed out.', 504, 'provider_timeout');
      throw recognitionError('Meta is temporarily unavailable.', 502, 'provider_unavailable');
    }
    const body = await response.json().catch(() => ({}));
    const blocked = body?.error?.code === 'content_policy_violation' || body?.choices?.[0]?.finish_reason === 'content_filter';
    if (blocked) throw recognitionError('Meta blocked this image.', 422, 'content_blocked');
    if (response.status === 401) throw recognitionError('Wrong Meta API key.', 401, 'invalid_api_key');
    if (response.status === 402) throw recognitionError('Meta billing is not available for this API key.', 402, 'billing_required');
    if (response.status === 403) throw recognitionError('This Meta API key cannot use ingredient recognition.', 403, 'provider_forbidden');
    if (response.status === 404 && body?.error?.code === 'model_not_found') {
      throw recognitionError('The Meta ingredient-recognition model is not available for this API key.', 503, 'model_unavailable');
    }
    if (response.status === 429) throw recognitionError('Meta rate limit reached.', 429, 'rate_limited');
    if (!response.ok) throw recognitionError('Meta request failed.', 502, 'provider_error');
    const message = body?.choices?.[0]?.message;
    if (message?.refusal) throw recognitionError('Meta blocked this image.', 422, 'content_blocked');
    const generated = parseJsonText(message?.content, 'Meta');
    if (!generated || typeof generated !== 'object' || !Array.isArray(generated.ingredients)) {
      throw recognitionError('Meta returned an invalid ingredient list.', 502, 'invalid_response');
    }
    return generated.ingredients;
  }
}

export function createIngredientRecognitionProvider(credentials = {}, options = {}) {
  const selected = String(credentials.provider || '').trim().toUpperCase();
  const apiKey = String(credentials.apiKey || '').trim();
  const common = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  if (selected === RecognitionModelProvider.META) {
    return new MetaIngredientRecognitionProvider({
      ...common,
      apiKey,
      model: options.metaModel,
      baseUrl: options.metaBaseUrl,
    });
  }
  if (selected === RecognitionModelProvider.GEMINI) {
    return new GeminiIngredientRecognitionProvider({
      ...common,
      apiKey,
      model: options.geminiModel,
    });
  }
  throw recognitionError('Select Meta or Google Gemini in Settings.', 400, 'invalid_provider');
}

export async function detectIngredients(payload, provider, credentials) {
  const image = validateIngredientImage(payload);
  const activeProvider = provider ?? createIngredientRecognitionProvider(credentials);
  return { ingredients: await activeProvider.detect(image) };
}
