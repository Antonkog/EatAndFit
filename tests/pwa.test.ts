import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

test('web manifest installs Eat & Fit in standalone mode with branded icons', () => {
  assert.equal(manifest.name, 'Eat & Fit');
  assert.equal(manifest.short_name, 'Eat & Fit');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#101712');
  assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ['192x192', '512x512', '512x512']);
  assert.equal(manifest.icons.at(-1).purpose, 'maskable');
});

test('iPhone metadata and settings explain Home Screen standalone installation', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/settings/SettingsView.tsx', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black"/);
  assert.match(html, /apple-touch-icon/);
  assert.match(settings, /Install Eat &amp; Fit/);
  assert.match(settings, /Share → Add to Home Screen/);
  assert.match(settings, /without Safari’s bottom website bar/);
});

test('service worker caches only the app shell and static same-origin requests', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(main, /import\.meta\.env\.PROD/);
  assert.match(main, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(worker, /eat-and-fit-shell-v1/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
});

test('PWA icon files are non-empty PNG images', () => {
  for (const name of ['apple-touch-icon.png', 'pwa-icon-192.png', 'pwa-icon-512.png', 'pwa-maskable-512.png']) {
    const url = new URL(`../public/${name}`, import.meta.url);
    const data = readFileSync(url);
    assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(statSync(url).size > 1_000, `${name} should contain a rendered brand mark`);
  }
});
