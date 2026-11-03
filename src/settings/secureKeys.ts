import { AI_KEY_SETUP_ENABLED, GEMINI_API_ENABLED, HYBRID_AI_CREDENTIALS, META_API_ENABLED, SERVER_MANAGED_AI } from '../config/appConfig';

export type RecognitionProvider = 'META' | 'GEMINI';
export type RecognitionCredential = { provider: RecognitionProvider; apiKey: string; source: 'device' | 'server' };
export type RecognitionKeyStatus = {
  activeProvider: RecognitionProvider;
  metaConfigured: boolean;
  geminiConfigured: boolean;
  metaDeviceConfigured: boolean;
  geminiDeviceConfigured: boolean;
};

type StoredKey = { id: 'device-key'; key: CryptoKey };
type StoredSecret = { provider: RecognitionProvider; iv: number[]; ciphertext: number[] };
type StoredPreference = { id: 'active-provider'; value: RecognitionProvider };

const DATABASE = 'eat-and-fit-secure-settings';
const VERSION = 1;
export const RECOGNITION_KEYS_CHANGED = 'eatfit-recognition-keys-change';

export function recognitionProviderEnabled(provider: RecognitionProvider) {
  return provider === 'META' ? META_API_ENABLED : GEMINI_API_ENABLED;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('keyring')) database.createObjectStore('keyring', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('secrets')) database.createObjectStore('secrets', { keyPath: 'provider' });
      if (!database.objectStoreNames.contains('preferences')) database.createObjectStore('preferences', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deviceKey(database: IDBDatabase) {
  const existing = await requestResult(database.transaction('keyring').objectStore('keyring').get('device-key')) as StoredKey | undefined;
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await requestResult(database.transaction('keyring', 'readwrite').objectStore('keyring').put({ id: 'device-key', key } satisfies StoredKey));
  return key;
}

export async function encryptSecret(value: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return { iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] };
}

export async function decryptSecret(value: Pick<StoredSecret, 'iv' | 'ciphertext'>, key: CryptoKey) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(value.iv) },
    key,
    new Uint8Array(value.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function records() {
  const database = await openDatabase();
  const secrets = await requestResult(database.transaction('secrets').objectStore('secrets').getAll()) as StoredSecret[];
  const preference = await requestResult(database.transaction('preferences').objectStore('preferences').get('active-provider')) as StoredPreference | undefined;
  database.close();
  return { secrets, preference };
}

export async function getRecognitionKeyStatus(): Promise<RecognitionKeyStatus> {
  if (SERVER_MANAGED_AI && !HYBRID_AI_CREDENTIALS) {
    return { activeProvider: 'META', metaConfigured: META_API_ENABLED, geminiConfigured: false, metaDeviceConfigured: false, geminiDeviceConfigured: false };
  }
  const { secrets, preference } = await records();
  const providers = new Set(secrets.map((secret) => secret.provider).filter(recognitionProviderEnabled));
  const sharedMeta = HYBRID_AI_CREDENTIALS && META_API_ENABLED;
  const available = (provider: RecognitionProvider) => providers.has(provider) || (provider === 'META' && sharedMeta);
  const fallback = sharedMeta || providers.has('META') ? 'META' : 'GEMINI';
  const activeProvider = preference?.value && available(preference.value) ? preference.value : fallback;
  return {
    activeProvider,
    metaConfigured: providers.has('META') || sharedMeta,
    geminiConfigured: providers.has('GEMINI'),
    metaDeviceConfigured: providers.has('META'),
    geminiDeviceConfigured: providers.has('GEMINI'),
  };
}

export async function saveRecognitionKey(provider: RecognitionProvider, value: string) {
  if (!AI_KEY_SETUP_ENABLED) throw new Error('API credentials are managed by the Eat & Fit server in this build.');
  if (!recognitionProviderEnabled(provider)) throw new Error('This AI provider is disabled in the application configuration.');
  const apiKey = value.trim();
  if (!apiKey) throw new Error('Enter an API key before saving.');
  const verification = await fetch('/api/ai/keys/verify', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-recognition-provider': provider },
    body: '{}',
  });
  const verificationBody = await verification.json().catch(() => ({}));
  if (!verification.ok || verificationBody?.ok !== true) throw new Error(verification.status === 401 ? 'Wrong API key' : verificationBody?.error || 'The API key could not be verified.');
  const database = await openDatabase();
  try {
    const encrypted = await encryptSecret(apiKey, await deviceKey(database));
    await requestResult(database.transaction('secrets', 'readwrite').objectStore('secrets').put({ provider, ...encrypted } satisfies StoredSecret));
    await requestResult(database.transaction('preferences', 'readwrite').objectStore('preferences').put({ id: 'active-provider', value: provider } satisfies StoredPreference));
  } finally {
    database.close();
  }
  window.dispatchEvent(new Event(RECOGNITION_KEYS_CHANGED));
}

export async function removeRecognitionKey(provider: RecognitionProvider) {
  if (!AI_KEY_SETUP_ENABLED) throw new Error('API credentials are managed by the Eat & Fit server in this build.');
  const database = await openDatabase();
  await requestResult(database.transaction('secrets', 'readwrite').objectStore('secrets').delete(provider));
  database.close();
  const status = await getRecognitionKeyStatus();
  if ((status.activeProvider === 'META' && status.metaConfigured) || (status.activeProvider === 'GEMINI' && status.geminiConfigured)) {
    await setActiveRecognitionProvider(status.activeProvider);
  }
  window.dispatchEvent(new Event(RECOGNITION_KEYS_CHANGED));
}

export async function setActiveRecognitionProvider(provider: RecognitionProvider) {
  if (!AI_KEY_SETUP_ENABLED) throw new Error('The AI provider is managed by the Eat & Fit server in this build.');
  if (!recognitionProviderEnabled(provider)) throw new Error('This AI provider is disabled in the application configuration.');
  const status = await getRecognitionKeyStatus();
  const configured = provider === 'META' ? status.metaConfigured : status.geminiConfigured;
  if (!configured) throw new Error(`Save a ${provider === 'META' ? 'Meta' : 'Gemini'} API key first.`);
  const database = await openDatabase();
  await requestResult(database.transaction('preferences', 'readwrite').objectStore('preferences').put({ id: 'active-provider', value: provider } satisfies StoredPreference));
  database.close();
  window.dispatchEvent(new Event(RECOGNITION_KEYS_CHANGED));
}

export async function getRecognitionCredential(): Promise<RecognitionCredential | undefined> {
  if (SERVER_MANAGED_AI && !HYBRID_AI_CREDENTIALS) return META_API_ENABLED ? { provider: 'META', apiKey: '', source: 'server' } : undefined;
  const status = await getRecognitionKeyStatus();
  const configured = status.activeProvider === 'META' ? status.metaConfigured : status.geminiConfigured;
  if (!configured) return undefined;
  const database = await openDatabase();
  try {
    const secret = await requestResult(database.transaction('secrets').objectStore('secrets').get(status.activeProvider)) as StoredSecret | undefined;
    if (!secret) return HYBRID_AI_CREDENTIALS && status.activeProvider === 'META' && META_API_ENABLED
      ? { provider: 'META', apiKey: '', source: 'server' }
      : undefined;
    return { provider: status.activeProvider, apiKey: await decryptSecret(secret, await deviceKey(database)), source: 'device' };
  } finally {
    database.close();
  }
}

export async function getRecognitionCredentialForProvider(provider: RecognitionProvider): Promise<RecognitionCredential | undefined> {
  if (SERVER_MANAGED_AI && !HYBRID_AI_CREDENTIALS) return provider === 'META' && META_API_ENABLED ? { provider: 'META', apiKey: '', source: 'server' } : undefined;
  if (!recognitionProviderEnabled(provider)) return undefined;
  const database = await openDatabase();
  try {
    const secret = await requestResult(database.transaction('secrets').objectStore('secrets').get(provider)) as StoredSecret | undefined;
    if (!secret) return HYBRID_AI_CREDENTIALS && provider === 'META' && META_API_ENABLED
      ? { provider: 'META', apiKey: '', source: 'server' }
      : undefined;
    return { provider, apiKey: await decryptSecret(secret, await deviceKey(database)), source: 'device' };
  } finally {
    database.close();
  }
}
