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

test('mobile barcode camera stays close to the scan target height', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const productScanner = readFileSync(new URL('../src/scanner/ProductScanner.tsx', import.meta.url), 'utf8');
  assert.match(styles, /@media \(max-width: 800px\)[\s\S]*?\.camera-frame \{ height: 170px; min-height: 170px; \}/);
  assert.match(styles, /\.camera-frame > span[^}]+height: 130px/);
  assert.match(styles, /\.camera-frame video[^}]+position: absolute[^}]+object-fit: fill[^}]+translate\(-50%,-50%\)/);
  assert.match(productScanner, /const coverScale = Math\.max\(frameWidth \/ video\.videoWidth, frameHeight \/ video\.videoHeight\)/);
  assert.match(productScanner, /visualViewport\?\.addEventListener\('resize'/);
});

test('ingredient recognition uses the button for progress and keeps only useful status messages', () => {
  const source = readFileSync(new URL('../src/scanner/ScanView.tsx', import.meta.url), 'utf8');
  assert.match(source, /scanning \? 'Recognizing…' : 'Recognize ingredients'/);
  assert.doesNotMatch(source, /setStatus\('Recognizing ingredients…'\)/);
  assert.doesNotMatch(source, /setStatus\(result\.data\.length \? 'Review every ingredient/);
  assert.match(source, /AI Recipe Generation/);
});

test('generated recipe calendar action has spacing below its schedule fields', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.save-food-panel \.primary-button \{ width: 100%; margin-top: 8px; \}/);
});
