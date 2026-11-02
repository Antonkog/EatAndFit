import assert from 'node:assert/strict';
import test from 'node:test';
import { NetworkResults } from '../src/api/NetworkResult';
import { formatDiagnosticLog, type DiagnosticEntry } from '../src/diagnostics/clientLog';

test('network results use sealed loading, success, and failure variants', () => {
  assert.deepEqual(NetworkResults.loading<number>(), { state: 'loading' });
  assert.deepEqual(NetworkResults.success(2), { state: 'success', data: 2 });
  assert.deepEqual(NetworkResults.failure({ code: 'offline', message: 'Offline', retryable: true }), {
    state: 'failure',
    error: { code: 'offline', message: 'Offline', retryable: true },
  });
});

test('diagnostic log writes timestamp first and details on following lines', () => {
  const entries: DiagnosticEntry[] = [{
    timestamp: '2026-11-02T10:00:00.000Z',
    feature: 'AI recipe photo generation',
    result: 'failure',
    context: { provider: 'META', model: 'muse-image-1.0', durationMs: 1200 },
    error: { code: 'photo_failed', message: 'Model unavailable', retryable: true },
  }];
  const output = formatDiagnosticLog(entries, '2026-11-02T10:01:00.000Z');
  assert.match(output, /2026-11-02T10:00:00\.000Z\nFeature: AI recipe photo generation\nResult: failure/);
  assert.match(output, /Provider: META\nModel: muse-image-1\.0\nDuration: 1200 ms/);
});

test('diagnostic log redacts credentials from errors', () => {
  const entries: DiagnosticEntry[] = [{
    timestamp: '2026-11-02T10:00:00.000Z',
    feature: 'AI ingredient recognition',
    result: 'failure',
    context: {},
    error: { code: 'auth', message: 'Authorization: Bearer sk-secret-token-value', retryable: false },
  }];
  const output = formatDiagnosticLog(entries);
  assert.doesNotMatch(output, /sk-secret-token-value/);
  assert.match(output, /\[REDACTED\]/);
});

test('diagnostic log retains a bounded raw server response and HTTP status', () => {
  const entries: DiagnosticEntry[] = [{
    timestamp: '2026-11-02T10:00:00.000Z',
    feature: 'AI recipe photo generation',
    result: 'failure',
    context: { provider: 'META', model: 'muse-image-1.0' },
    error: { code: 'provider_error', message: 'Photo generation failed', retryable: true, httpStatus: 429, rawResponse: '{"error":{"message":"rate limited"}}' },
  }];
  const output = formatDiagnosticLog(entries);
  assert.match(output, /HTTP status: 429/);
  assert.match(output, /Raw response: \{"error"/);
});
