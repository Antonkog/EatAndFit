const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-nano-banana-2.1';

export class RecipeImageGenerationError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'RecipeImageGenerationError';
    this.status = status;
    this.code = code;
  }
}

function imageError(message, status, code) {
  return new RecipeImageGenerationError(message, status, code);
}

function recipePrompt(recipe) {
  return [
    `Create a realistic professional food photograph of ${recipe.title}.`,
    recipe.description,
    `The plated dish should visibly reflect these ingredients: ${recipe.ingredients.join(', ')}.`,
    'Use natural appetizing lighting and a clean three-quarter food-photography composition.',
    'Do not include people, hands, packaging, logos, captions, labels, or written text.',
  ].join(' ');
}

function validateRecipe(value) {
  const recipe = value?.recipe;
  if (
    !recipe || typeof recipe !== 'object' ||
    typeof recipe.title !== 'string' || !recipe.title.trim() || recipe.title.length > 120 ||
    typeof recipe.description !== 'string' || !recipe.description.trim() || recipe.description.length > 500 ||
    !Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > 40 ||
    !recipe.ingredients.every((item) => typeof item === 'string' && item.trim() && item.length <= 160)
  ) throw imageError('Recipe photo request is invalid.', 400, 'invalid_request');
  return recipe;
}

function parseGeminiImage(body) {
  const interaction = body?.interaction ?? body;
  const data = interaction?.output_image ?? interaction?.outputImage;
  if (!data?.data || typeof data.data !== 'string') throw imageError('Gemini returned an invalid recipe photo.', 502, 'invalid_response');
  return { imageBase64: data.data, mimeType: data.mime_type ?? data.mimeType ?? 'image/png' };
}

export class RecipeImageGenerationProvider {
  async generate(_recipe) {
    throw new Error('RecipeImageGenerationProvider.generate() must be implemented.');
  }
}

export class GeminiRecipeImageGenerationProvider extends RecipeImageGenerationProvider {
  constructor({ apiKey = '', model = DEFAULT_GEMINI_IMAGE_MODEL, fetchImpl = fetch, timeoutMs = 90_000, endpoint = GEMINI_INTERACTIONS_ENDPOINT } = {}) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.endpoint = endpoint;
  }

  async generate(recipe) {
    let response;
    try {
      response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          model: this.model,
          input: [{ type: 'text', text: recipePrompt(recipe) }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw imageError('Gemini recipe photo generation timed out.', 504, 'provider_timeout');
      throw imageError('Gemini recipe photo generation is temporarily unavailable.', 502, 'provider_unavailable');
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) throw imageError('Wrong Gemini API key.', 401, 'invalid_api_key');
    if (response.status === 429) throw imageError('Gemini image-generation rate limit reached.', 429, 'rate_limited');
    if (body?.promptFeedback?.blockReason || body?.error?.status === 'FAILED_PRECONDITION' || body?.interaction?.status === 'blocked') throw imageError('Gemini blocked this recipe photo request.', 422, 'content_blocked');
    if (response.status === 404) throw imageError('The Gemini image model is not available for this API key.', 503, 'model_unavailable');
    if (!response.ok) throw imageError('Gemini recipe photo generation failed.', 502, 'provider_error');
    return { ...parseGeminiImage(body), provider: 'GEMINI', model: this.model };
  }
}

export function createRecipeImageGenerationProvider(credentials = {}, options = {}) {
  const provider = String(credentials.provider || '').trim().toUpperCase();
  if (provider !== 'GEMINI') throw imageError('Gemini recipe photo generation requires the selected Gemini provider.', 400, 'invalid_provider');
  return new GeminiRecipeImageGenerationProvider({ apiKey: String(credentials.apiKey || '').trim(), ...options });
}

export async function generateRecipeImage(request, provider, credentials) {
  const recipe = validateRecipe(request);
  return (provider ?? createRecipeImageGenerationProvider(credentials)).generate(recipe);
}

