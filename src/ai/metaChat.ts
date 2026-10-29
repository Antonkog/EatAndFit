const META_CHAT_COMPLETIONS_URL = 'https://api.meta.ai/v1/chat/completions';
const META_MODELS = ['muse-spark-1.3-contributor', 'muse-spark-1.3'] as const;

export async function requestMetaChat(
  apiKey: string,
  request: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
) {
  let lastBody: any;
  let lastResponse: Response | undefined;

  for (const model of META_MODELS) {
    let response: Response;
    try {
      response = await fetchImpl(META_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, model }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new Error('Meta is temporarily unavailable. Try again.');
    }

    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('Meta is temporarily unavailable. Try again.');
    }

    lastBody = body;
    lastResponse = response;
    if (response.status !== 404 || body?.error?.code !== 'model_not_found') {
      return { response, body, model };
    }
  }

  return { response: lastResponse!, body: lastBody, model: META_MODELS.at(-1)! };
}

export function throwMetaRequestError(response: Response, body: any, capability: string): void {
  if (response.status === 401) throw new Error('Wrong Meta API key.');
  if (response.status === 402) throw new Error('Meta billing is not available for this API key.');
  if (response.status === 403) throw new Error(`This Meta API key cannot use ${capability}.`);
  if (response.status === 404 && body?.error?.code === 'model_not_found') throw new Error(`The Meta ${capability} model is temporarily unavailable. Try again.`);
  if (response.status === 429) throw new Error('Meta rate limit reached.');
  if (!response.ok) throw new Error(body?.error?.message || `Meta ${capability} failed.`);
}
