import { isIP } from 'node:net';

const COUNTRY_GROUPS = [
  ['american', ['US', 'CA']],
  ['british', ['GB', 'IE']],
  ['mexican', ['MX']],
  ['chinese', ['CN', 'HK', 'MO', 'TW']],
  ['japanese', ['JP']],
  ['korean', ['KR', 'KP']],
  ['indian', ['IN', 'PK', 'BD', 'LK', 'NP', 'BT']],
  ['french', ['FR', 'MC']],
  ['italian', ['IT', 'SM', 'VA']],
  ['greek', ['GR', 'CY']],
  ['mediterranean', ['DZ', 'ES', 'LY', 'MA', 'MT', 'PT', 'TN']],
  ['nordic', ['DK', 'FI', 'IS', 'NO', 'SE', 'FO', 'GL']],
  ['south american', ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE']],
  ['caribbean', ['AG', 'AI', 'AW', 'BB', 'BL', 'BQ', 'BS', 'CU', 'CW', 'DM', 'DO', 'GD', 'GP', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'PR', 'SX', 'TC', 'TT', 'VC', 'VG', 'VI']],
  ['south east asian', ['BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'TL', 'VN']],
  ['middle eastern', ['AE', 'AM', 'AZ', 'BH', 'EG', 'GE', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE']],
  ['central europe', ['AT', 'BE', 'CH', 'CZ', 'DE', 'HU', 'LI', 'LU', 'NL', 'PL', 'SK', 'SI']],
  ['eastern europe', ['AL', 'BA', 'BG', 'BY', 'EE', 'HR', 'LT', 'LV', 'MD', 'ME', 'MK', 'RO', 'RS', 'RU', 'UA', 'XK']],
  ['asian', ['AF', 'KZ', 'KG', 'MN', 'TJ', 'TM', 'UZ']],
];

const COUNTRY_CUISINE = new Map(COUNTRY_GROUPS.flatMap(([cuisine, countries]) => countries.map((country) => [country, cuisine])));

export function countryCodeToCuisine(countryCode) {
  return COUNTRY_CUISINE.get(String(countryCode ?? '').trim().toUpperCase()) ?? 'world';
}

export function countryCodeFromLanguage(header) {
  const languages = String(header ?? '')
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .filter(Boolean);
  for (const language of languages) {
    const match = language.match(/^[a-z]{2,3}[-_]([a-z]{2})$/i);
    if (match) return match[1].toUpperCase();
  }
  return undefined;
}

function normalizedIp(value) {
  const first = String(value ?? '').split(',')[0].trim();
  return first.startsWith('::ffff:') ? first.slice(7) : first;
}

export function isPublicIp(value) {
  const ip = normalizedIp(value);
  const version = isIP(ip);
  if (!version) return false;
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = ip.toLowerCase();
  return lower !== '::1' && lower !== '::' && !lower.startsWith('fc') && !lower.startsWith('fd') && !lower.startsWith('fe8') && !lower.startsWith('fe9') && !lower.startsWith('fea') && !lower.startsWith('feb');
}

function requestIp(request) {
  return normalizedIp(request.headers?.['x-real-ip'] ?? request.headers?.['x-forwarded-for'] ?? request.socket?.remoteAddress);
}

function languageFallback(request) {
  const countryCode = countryCodeFromLanguage(request.headers?.['accept-language']);
  return {
    countryCode: countryCode ?? null,
    cuisine: countryCodeToCuisine(countryCode),
    source: countryCode ? 'language' : 'fallback',
  };
}

export async function resolveCuisineLocation(request, { fetchImpl = fetch, timeoutMs = 1800 } = {}) {
  const ip = requestIp(request);
  if (!isPublicIp(ip)) return languageFallback(request);
  try {
    const response = await fetchImpl(`https://api.country.is/${encodeURIComponent(ip)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return languageFallback(request);
    const payload = await response.json();
    const countryCode = typeof payload?.country === 'string' && /^[A-Z]{2}$/i.test(payload.country) ? payload.country.toUpperCase() : undefined;
    if (!countryCode) return languageFallback(request);
    return { countryCode, cuisine: countryCodeToCuisine(countryCode), source: 'ip' };
  } catch {
    return languageFallback(request);
  }
}
