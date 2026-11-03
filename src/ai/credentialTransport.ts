import type { RecognitionCredential } from '../settings/secureKeys';

const META_API_BASE_URL = 'https://api.meta.ai/v1';

/**
 * All server-secret versus device-key routing lives here so credential modes can
 * be switched without duplicating security decisions across product features.
 */
export function usesDirectMetaTransport(credential: RecognitionCredential) {
  return credential.provider === 'META' && credential.source === 'device';
}

export function aiApiHeaders(credential: RecognitionCredential, json = true): Record<string, string> {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    'x-recognition-provider': credential.provider,
    ...(credential.source === 'device' ? { authorization: `Bearer ${credential.apiKey}` } : {}),
  };
}

export function metaTransportUrl(credential: RecognitionCredential, path: string) {
  return credential.source === 'server' ? `/api/ai/meta${path}` : `${META_API_BASE_URL}${path}`;
}

export function metaTransportHeaders(credential: RecognitionCredential, headers: Record<string, string> = {}) {
  return credential.source === 'server' ? headers : { ...headers, Authorization: `Bearer ${credential.apiKey}` };
}
