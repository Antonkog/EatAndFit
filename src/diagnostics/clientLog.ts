import { NetworkResults, toAppError, type AppError, type NetworkResult } from '../api/NetworkResult';

export type DiagnosticContext = {
  provider?: string;
  model?: string;
  durationMs?: number;
  outputCount?: number;
  detail?: string;
};

export type DiagnosticEntry = {
  timestamp: string;
  feature: string;
  result: 'success' | 'failure';
  context: DiagnosticContext;
  error?: AppError;
};

const STORAGE_KEY = 'eat-and-fit:diagnostic-log:v1';
const MAX_ENTRIES = 200;

function clean(value: string) {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_ -]?key|authorization)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/\bAIza[\w-]{20,}\b/g, '[REDACTED]')
    .replace(/\bsk-[\w-]{16,}\b/g, '[REDACTED]')
    .slice(0, 600);
}

function readEntries(): DiagnosticEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntry(entry: DiagnosticEntry) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readEntries(), entry].slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never interrupt the product flow.
  }
}

export async function runLoggedAiOperation<T>(
  feature: string,
  operation: () => Promise<T>,
  context: DiagnosticContext = {},
  errorCode = 'ai_request_failed',
  onState?: (result: NetworkResult<T>) => void,
): Promise<NetworkResult<T>> {
  const startedAt = performance.now();
  onState?.(NetworkResults.loading());
  try {
    const data = await operation();
    writeEntry({
      timestamp: new Date().toISOString(),
      feature,
      result: 'success',
      context: { ...context, durationMs: Math.round(performance.now() - startedAt) },
    });
    const result = NetworkResults.success(data);
    onState?.(result);
    return result;
  } catch (value) {
    const error = toAppError(value, 'The AI request failed.', errorCode);
    writeEntry({
      timestamp: new Date().toISOString(),
      feature,
      result: 'failure',
      context: { ...context, durationMs: Math.round(performance.now() - startedAt) },
      error: { ...error, message: clean(error.message) },
    });
    const result = NetworkResults.failure<T>(error);
    onState?.(result);
    return result;
  }
}

export function recordAiSuccess(feature: string, context: DiagnosticContext = {}) {
  writeEntry({ timestamp: new Date().toISOString(), feature, result: 'success', context });
}

export function recordAiFailure(feature: string, value: unknown, context: DiagnosticContext = {}, errorCode = 'ai_request_failed') {
  const error = toAppError(value, 'The AI request failed.', errorCode);
  writeEntry({
    timestamp: new Date().toISOString(),
    feature,
    result: 'failure',
    context,
    error: { ...error, message: clean(error.message) },
  });
  return error;
}

export function formatDiagnosticLog(entries = readEntries(), generatedAt = new Date().toISOString()) {
  const header = [
    'Eat & Fit diagnostic log',
    `Generated: ${generatedAt}`,
    'This file contains AI operation metadata and sanitized errors. It does not contain API keys, prompts, photos, or videos.',
  ].join('\n');
  if (!entries.length) return `${header}\n\nNo diagnostic events recorded.\n`;
  const body = entries.map((entry) => {
    const lines = [
      entry.timestamp,
      `Feature: ${clean(entry.feature)}`,
      `Result: ${entry.result}`,
    ];
    if (entry.context.provider) lines.push(`Provider: ${clean(entry.context.provider)}`);
    if (entry.context.model) lines.push(`Model: ${clean(entry.context.model)}`);
    if (entry.context.durationMs !== undefined) lines.push(`Duration: ${entry.context.durationMs} ms`);
    if (entry.context.outputCount !== undefined) lines.push(`Output count: ${entry.context.outputCount}`);
    if (entry.context.detail) lines.push(`Detail: ${clean(entry.context.detail)}`);
    if (entry.error) {
      lines.push(`Error code: ${clean(entry.error.code)}`);
      lines.push(`Error: ${clean(entry.error.message)}`);
    }
    return lines.join('\n');
  }).join('\n\n');
  return `${header}\n\n${body}\n`;
}

export function downloadDiagnosticLog() {
  const url = URL.createObjectURL(new Blob([formatDiagnosticLog()], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'log.txt';
  link.click();
  URL.revokeObjectURL(url);
}

export function clearDiagnosticLog() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
}
