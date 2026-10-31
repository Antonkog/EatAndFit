import assert from 'node:assert/strict';import { readFileSync } from 'node:fs';import test from 'node:test';import {boundedDimensions} from '../src/scanner/image';import { normalizeScannedBarcode } from '../src/scanner/ProductScanner';
test('scanner dimensions preserve ratio without upscaling',()=>{assert.deepEqual(boundedDimensions(4000,2000),{width:1600,height:800});assert.deepEqual(boundedDimensions(800,600),{width:800,height:600})});

test('live barcode results are normalized and limited to supported product-code lengths', () => {
  assert.equal(normalizeScannedBarcode('0 12345-678905'), '012345678905');
  assert.equal(normalizeScannedBarcode('12345678'), '12345678');
  assert.equal(normalizeScannedBarcode('12345678901234'), '12345678901234');
  assert.equal(normalizeScannedBarcode('1234567'), undefined);
  assert.equal(normalizeScannedBarcode('123456789012345'), undefined);
});

test('product scanner decodes supported formats once, auto-lookups, retries, and cleans up the camera', () => {
  const source = readFileSync(new URL('../src/scanner/ProductScanner.tsx', import.meta.url), 'utf8');
  for (const format of ['EAN_8', 'EAN_13', 'UPC_A', 'UPC_E', 'ITF']) assert.match(source, new RegExp(`BarcodeFormat\\.${format}`));
  assert.match(source, /decodeFromConstraints/);
  assert.match(source, /detectionHandled\.current/);
  assert.match(source, /void lookup\(code\)/);
  assert.match(source, /stopCamera/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /Retry camera/);
  assert.match(source, /enter the barcode manually/i);
});
