import { requestMetaChat, throwMetaRequestError } from '../ai/metaChat';

const MAX_INGREDIENTS = 30;
const MAX_INGREDIENT_NAME_LENGTH = 80;

function normalizeIngredients(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Meta returned an invalid ingredient list.');
  const ingredients: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('Meta returned an invalid ingredient name.');
    const compact = item.replace(/\s+/g, ' ').trim().slice(0, MAX_INGREDIENT_NAME_LENGTH).trim();
    if (!compact || !/[A-Za-z]/.test(compact)) continue;
    const canonical = compact.toLocaleLowerCase('en-US');
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    ingredients.push(compact.charAt(0).toLocaleUpperCase('en-US') + compact.slice(1));
    if (ingredients.length === MAX_INGREDIENTS) break;
  }
  return ingredients;
}

export async function recognizeIngredientsWithMeta(
  image: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
) {
  const { response, body } = await requestMetaChat(apiKey, {
      temperature: 0,
      messages: [
        { role: 'system', content: 'You identify visible food ingredients and return strict JSON only.' },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identify all distinct edible ingredients clearly visible in this image. Return a JSON object with an ingredients array of concise common English names. Do not include quantities, recipes, confidence scores, or ingredients that are hidden or merely implied. Return an empty ingredients array when none are identifiable.',
            },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
  }, fetchImpl);

  throwMetaRequestError(response, body, 'ingredient-recognition');
  if (body?.choices?.[0]?.finish_reason === 'content_filter' || body?.choices?.[0]?.message?.refusal) throw new Error('Meta blocked this image.');

  let generated: any;
  try {
    generated = JSON.parse(body?.choices?.[0]?.message?.content ?? '');
  } catch {
    throw new Error('Meta returned an invalid response.');
  }
  return normalizeIngredients(generated?.ingredients);
}
