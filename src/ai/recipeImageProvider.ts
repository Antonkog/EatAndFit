import { NetworkResults, toAppError, type NetworkResult } from '../api/NetworkResult';
import type { RecognitionCredential, RecognitionProvider } from '../settings/secureKeys';
import type { AiRecipe } from './validation';

const META_IMAGE_ENDPOINT = 'https://api.meta.ai/v1/images/generations';
const META_IMAGE_MODEL = 'muse-image-1.0';
const GEMINI_IMAGE_MODEL = 'gemini-nano-banana-2.1';

export type GeneratedRecipeImage = {
  blob: Blob;
  provider: RecognitionProvider;
  model: string;
};
export type GeneratedAiRecipe = AiRecipe & { generatedImage?: GeneratedRecipeImage };

export interface RecipeImageGenerationProvider {
  generate(recipe: AiRecipe): Promise<GeneratedRecipeImage>;
}

export async function attachGeneratedRecipeImages(
  recipes: AiRecipe[],
  provider: RecipeImageGenerationProvider,
  onResult?: (index: number, result: NetworkResult<GeneratedRecipeImage>) => void,
) {
  const images = await Promise.all(recipes.map(async (recipe, index) => {
    let result: NetworkResult<GeneratedRecipeImage>;
    try {
      result = NetworkResults.success(await provider.generate(recipe));
    } catch (error) {
      result = NetworkResults.failure(toAppError(error, 'Recipe photo generation failed.', 'recipe_photo_failed'));
    }
    onResult?.(index, result);
    return result;
  }));
  return recipes.map<GeneratedAiRecipe>((recipe, index) => {
    const image = images[index];
    return image?.state === 'success' ? { ...recipe, generatedImage: image.data } : recipe;
  });
}

export function recipeImagePrompt(recipe: AiRecipe) {
  return [
    `Create a realistic professional food photograph of ${recipe.title}.`,
    recipe.description,
    `The plated dish should visibly reflect these ingredients: ${recipe.ingredients.join(', ')}.`,
    'Use natural appetizing lighting and a clean three-quarter food-photography composition.',
    'Do not include people, hands, packaging, logos, captions, labels, or written text.',
  ].join(' ');
}

function decodeBase64Image(value: string, mimeType = 'image/png') {
  if (!value.trim()) throw new Error('The image provider returned an empty image.');
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function imageFromResponse(value: any, fetchImpl: typeof fetch) {
  const image = value?.data?.[0] ?? value?.images?.[0] ?? value;
  const base64 = image?.b64_json ?? image?.base64 ?? image?.data;
  const outputFormat = value?.output_format ?? value?.outputFormat;
  const defaultMimeType = outputFormat === 'webp' ? 'image/webp' : outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
  if (typeof base64 === 'string') return decodeBase64Image(base64, image?.mime_type ?? image?.mimeType ?? defaultMimeType);
  if (typeof image?.url === 'string') {
    const response = await fetchImpl(image.url, { cache: 'no-store' });
    if (!response.ok) throw new Error('The generated photo could not be downloaded.');
    return response.blob();
  }
  throw new Error('The image provider returned an invalid image response.');
}

function metaError(response: Response, body: any) {
  if (response.status === 401) return new Error('Wrong Meta API key.');
  if (response.status === 402) return new Error('Meta billing is not available for this API key.');
  if (response.status === 403) return new Error('This Meta API key cannot generate recipe photos.');
  if (response.status === 404 && body?.error?.code === 'model_not_found') return new Error('The Meta image model is not available for this API key.');
  if (response.status === 429) return new Error('Meta image-generation rate limit reached.');
  if (body?.error?.code === 'content_policy_violation') return new Error('Meta blocked this recipe photo request.');
  return new Error('Meta recipe photo generation failed.');
}

export class MetaRecipeImageGenerationProvider implements RecipeImageGenerationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint = META_IMAGE_ENDPOINT,
    private readonly model = META_IMAGE_MODEL,
  ) {}

  async generate(recipe: AiRecipe): Promise<GeneratedRecipeImage> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: recipeImagePrompt(recipe),
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
          output_format: 'webp',
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') throw new Error('Meta recipe photo generation timed out.');
      throw new Error('Meta recipe photo generation is temporarily unavailable.');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw metaError(response, body);
    return { blob: await imageFromResponse(body, this.fetchImpl), provider: 'META', model: body?.model ?? this.model };
  }
}

export class GeminiRecipeImageGenerationProvider implements RecipeImageGenerationProvider {
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async generate(recipe: AiRecipe): Promise<GeneratedRecipeImage> {
    let response: Response;
    try {
      response = await this.fetchImpl('/api/ai/recipes/image', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'x-recognition-provider': 'GEMINI',
        },
        body: JSON.stringify({ recipe }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') throw new Error('Gemini recipe photo generation timed out.');
      throw new Error('Gemini recipe photo generation is temporarily unavailable.');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Gemini recipe photo generation failed.');
    return {
      blob: decodeBase64Image(body.imageBase64 ?? '', body.mimeType ?? 'image/png'),
      provider: 'GEMINI',
      model: body.model ?? GEMINI_IMAGE_MODEL,
    };
  }
}

export function createRecipeImageGenerationProvider(
  credential: RecognitionCredential,
  options: { fetchImpl?: typeof fetch; metaEndpoint?: string; metaModel?: string } = {},
): RecipeImageGenerationProvider {
  if (credential.provider === 'META') {
    return new MetaRecipeImageGenerationProvider(credential.apiKey, options.fetchImpl, options.metaEndpoint, options.metaModel);
  }
  if (credential.provider === 'GEMINI') return new GeminiRecipeImageGenerationProvider(credential.apiKey, options.fetchImpl);
  throw new Error('Select Meta or Google Gemini in Settings.');
}

