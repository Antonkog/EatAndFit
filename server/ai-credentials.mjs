import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { IngredientRecognitionError } from './ingredient-provider.mjs';

export function readServerMetaCredential(explicitKey) {
  if (typeof explicitKey === 'string') return explicitKey.trim();
  const secretPath = String(process.env.META_API_KEY_FILE ?? '/run/secrets/meta_api_key').trim();
  try { return readFileSync(secretPath, 'utf8').trim(); }
  catch { return ''; }
}

function deviceCredential(request, enabledProviders) {
  const provider = String(request.headers['x-recognition-provider'] ?? '').trim().toUpperCase();
  const authorization = String(request.headers.authorization ?? '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]?.trim()) throw new IngredientRecognitionError('Add an API key in Settings before using AI features.', 401, 'missing_user_key');
  if (!enabledProviders.includes(provider.toLowerCase())) throw new IngredientRecognitionError('This AI provider is disabled in the application configuration.', 403, 'provider_disabled');
  return { provider, apiKey: match[1].trim() };
}

export function createAiCredentialResolver({ mode, enabledProviders, sharedMetaApiKey }) {
  return (request) => {
    const hasDeviceCredential = /^Bearer\s+\S+/i.test(String(request.headers.authorization ?? ''));
    if (mode === 'server' || (mode === 'hybrid' && !hasDeviceCredential)) {
      if (!enabledProviders.includes('meta')) throw new IngredientRecognitionError('The shared Meta service is disabled.', 503, 'provider_disabled');
      if (!sharedMetaApiKey) throw new IngredientRecognitionError('The shared Meta service is not configured.', 503, 'provider_not_configured');
      return { provider: 'META', apiKey: sharedMetaApiKey };
    }
    return deviceCredential(request, enabledProviders);
  };
}

function readRawBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    request.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBytes) {
        rejected = true;
        reject(new IngredientRecognitionError('Request body is too large.', 413, 'request_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    request.on('error', reject);
  });
}

export async function proxySharedMetaRequest(request, response, url, apiKey) {
  const suffix = url.pathname.slice('/api/ai/meta'.length);
  let target;
  let body;
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (request.method === 'POST' && suffix === '/files') {
    target = 'https://api.meta.ai/v1/files';
    body = await readRawBody(request, 32 * 1024 * 1024);
    const contentType = String(request.headers['content-type'] ?? '');
    if (!contentType.startsWith('multipart/form-data;')) throw new IngredientRecognitionError('A multipart video upload is required.', 400, 'invalid_request');
    headers['Content-Type'] = contentType;
  } else if (request.method === 'POST' && suffix === '/responses') {
    target = 'https://api.meta.ai/v1/responses';
    body = await readRawBody(request, 2 * 1024 * 1024);
    let payload;
    try { payload = JSON.parse(body.toString('utf8')); }
    catch { throw new IngredientRecognitionError('Meta request must contain valid JSON.', 400, 'invalid_json'); }
    if (!['sam-3.1', 'muse-spark-1.3'].includes(payload?.model)) throw new IngredientRecognitionError('This Meta model is not allowed.', 403, 'model_disabled');
    headers['Content-Type'] = 'application/json';
    if (request.headers.accept) headers.Accept = String(request.headers.accept);
  } else if (request.method === 'DELETE' && /^\/files\/[A-Za-z0-9._-]+$/.test(suffix)) {
    target = `https://api.meta.ai/v1${suffix}`;
  } else {
    throw new IngredientRecognitionError('This shared Meta operation is not allowed.', 404, 'not_found');
  }
  const upstream = await fetch(target, { method: request.method, headers, body, signal: AbortSignal.timeout(180_000) });
  response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
  if (!upstream.body) return response.end();
  Readable.fromWeb(upstream.body).pipe(response);
}
