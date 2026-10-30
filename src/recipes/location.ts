export type CuisineLocation = {
  countryCode: string | null;
  cuisine: string;
  source: 'ip' | 'language' | 'fallback';
};

type CachedCuisineLocation = CuisineLocation & { expiresAt: number };

const LOCATION_CACHE_KEY = 'eat-and-fit:recipe-cuisine-location';
const LOCATION_CACHE_MS = 24 * 60 * 60 * 1000;

function validLocation(value: unknown): value is CuisineLocation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CuisineLocation>;
  return (item.countryCode === null || typeof item.countryCode === 'string')
    && typeof item.cuisine === 'string'
    && ['ip', 'language', 'fallback'].includes(String(item.source));
}

export async function getCuisineLocation(now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<CuisineLocation> {
  if (typeof localStorage !== 'undefined') {
    try {
      const cached = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY) ?? 'null') as CachedCuisineLocation | null;
      if (validLocation(cached) && Number.isFinite(cached.expiresAt) && cached.expiresAt > now) {
        return { countryCode: cached.countryCode, cuisine: cached.cuisine, source: cached.source };
      }
    } catch {
      localStorage.removeItem(LOCATION_CACHE_KEY);
    }
  }

  try {
    const response = await fetchImpl('/api/location/cuisine', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Location preference is unavailable.');
    const value: unknown = await response.json();
    if (!validLocation(value)) throw new Error('Location preference is invalid.');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({ ...value, expiresAt: now + LOCATION_CACHE_MS }));
    }
    return value;
  } catch {
    return { countryCode: null, cuisine: 'world', source: 'fallback' };
  }
}
