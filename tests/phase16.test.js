import { test, after } from 'node:test';
import { build } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SaveManager, InMemoryStorage } from '../src/utils/SaveManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const outputDir = mkdtempSync(resolve(tmpdir(), 'sprout-vite-test-'));
await build({ root: projectRoot, logLevel: 'silent', build: { outDir: outputDir } });
after(() => rmSync(outputDir, { recursive: true, force: true }));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

test('Phase16: capacitor.config.json exists and is valid', () => {
  const path = resolve(projectRoot, 'capacitor.config.json');
  assert.ok(existsSync(path), 'capacitor.config.json must exist');
  const config = readJson(path);
  assert.equal(config.appId, 'com.sproutvalley.app');
  assert.equal(config.appName, 'Sprout Valley');
  assert.equal(config.webDir, 'dist');
});

test('Phase16: capacitor android config has security flags', () => {
  const config = readJson(resolve(projectRoot, 'capacitor.config.json'));
  assert.ok(config.android);
  assert.equal(config.android.allowMixedContent, false);
  assert.ok(config.android.backgroundColor, 'backgroundColor should be set for splash');
  assert.ok(config.server, 'server config should be set');
  assert.equal(config.server.androidScheme, 'https');
});

test('Phase16: android folder exists with scaffolded project', () => {
  const requiredFiles = [
    'android/build.gradle',
    'android/settings.gradle',
    'android/variables.gradle',
    'android/gradlew',
    'android/app/build.gradle',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/assets/capacitor.config.json'
  ];
  for (const f of requiredFiles) {
    const path = resolve(projectRoot, f);
    assert.ok(existsSync(path), `${f} must exist`);
  }
});

test('Phase16: Android variables.gradle uses modern SDK levels', () => {
  const content = readFileSync(resolve(projectRoot, 'android/variables.gradle'), 'utf-8');
  const minSdk = content.match(/minSdkVersion\s*=\s*(\d+)/);
  const compileSdk = content.match(/compileSdkVersion\s*=\s*(\d+)/);
  const targetSdk = content.match(/targetSdkVersion\s*=\s*(\d+)/);
  assert.ok(minSdk, 'minSdkVersion defined');
  assert.ok(compileSdk, 'compileSdkVersion defined');
  assert.ok(targetSdk, 'targetSdkVersion defined');
  assert.ok(Number(minSdk[1]) >= 24, 'minSdk >= 24 (Android 7.0) for wide compatibility');
  assert.ok(Number(targetSdk[1]) >= 33, 'targetSdk >= 33 (Android 13) recommended');
});

test('Phase16: AndroidManifest references correct appId', () => {
  const content = readFileSync(resolve(projectRoot, 'android/app/build.gradle'), 'utf-8');
  assert.match(content, /applicationId\s+"com\.sproutvalley\.app"/);
});

test('Phase16: dist/ has built output', () => {
  const distIndex = resolve(outputDir, 'index.html');
  const distJs = resolve(outputDir, 'assets');
  assert.ok(existsSync(distIndex), 'dist/index.html must exist');
  assert.ok(existsSync(distJs), 'dist/assets/ must exist');
});

test('Phase16: dist/index.html uses relative paths for Capacitor file://', () => {
  const content = readFileSync(resolve(outputDir, 'index.html'), 'utf-8');
  const scriptMatch = content.match(/src="(\.\/[^"]+\.js)"/);
  assert.ok(scriptMatch, 'script tag with relative ./assets/ path must exist');
  assert.ok(scriptMatch[1].startsWith('./assets/'), 'script src should start with ./assets/');
});

test('Phase16: dist/index.html has touch-friendly viewport', () => {
  const content = readFileSync(resolve(outputDir, 'index.html'), 'utf-8');
  assert.match(content, /viewport-fit=cover/);
  assert.match(content, /user-scalable=no/);
  assert.match(content, /maximum-scale=1\.0/);
  assert.match(content, /touch-action:\s*none/);
});

test('Phase16: Android assets contain dist/ content', () => {
  const androidAssetsIndex = resolve(projectRoot, 'android/app/src/main/assets/public/index.html');
  const androidAssetsJs = resolve(projectRoot, 'android/app/src/main/assets/public/assets/');
  assert.ok(existsSync(androidAssetsIndex), 'android public/index.html must exist');
  assert.ok(existsSync(androidAssetsJs), 'android public/assets/ must exist');
});

test('Phase16: Capacitor settings.gradle includes core lib', () => {
  const content = readFileSync(resolve(projectRoot, 'android/capacitor.settings.gradle'), 'utf-8');
  assert.match(content, /capacitor-android/);
});

test('Phase16: package.json has Capacitor scripts and dependencies', () => {
  const pkg = readJson(resolve(projectRoot, 'package.json'));
  assert.ok(pkg.dependencies['@capacitor/core'], '@capacitor/core missing');
  assert.ok(pkg.devDependencies['@capacitor/cli'], '@capacitor/cli missing');
  assert.ok(pkg.devDependencies['@capacitor/android'], '@capacitor/android missing');
  assert.ok(pkg.scripts['cap:sync'], 'cap:sync script missing');
  assert.ok(pkg.scripts['cap:add:android'], 'cap:add:android script missing');
  assert.ok(pkg.scripts['cap:open:android'], 'cap:open:android script missing');
});

test('Phase16: SaveManager uses localStorage (WebView compatible)', () => {
  const manager = new SaveManager();
  if (typeof globalThis.localStorage === 'undefined') {
    assert.equal(manager.isAvailable(), false, 'manager reports unavailable if no localStorage');
  } else {
    assert.equal(manager.isAvailable(), true, 'manager uses localStorage in WebView');
  }
});

test('Phase16: SaveManager prefix is namespaced to app', () => {
  const manager = new SaveManager();
  assert.equal(manager.constructor.name, 'SaveManager');
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  m.save('test_key', { x: 1 });
  const raw = store.getItem('sproutvalley_test_key');
  assert.ok(raw, 'save should namespace key with prefix');
  assert.equal(JSON.parse(raw).x, 1);
});

test('Phase16: SaveManager key prefix is sproutvalley_', () => {
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  m.save('game_v1', { gold: 100 });
  const directValue = store.getItem('sproutvalley_game_v1');
  assert.ok(directValue, 'expected namespaced key');
  const otherKey = store.getItem('unrelated_key');
  assert.notEqual(directValue, otherKey);
});

test('Phase16: SaveManager.save then load roundtrips data', () => {
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  const original = { inventory: { slots: [], activeSlot: 0 }, economy: { gold: 100 } };
  m.save('game', original);
  const loaded = m.load('game');
  assert.deepEqual(loaded, original);
});

test('Phase16: SaveManager.has() returns true after save', () => {
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  m.save('game', { ok: true });
  assert.equal(m.has('game'), true);
});

test('Phase16: SaveManager.remove() deletes the key', () => {
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  m.save('game', { ok: true });
  m.remove('game');
  assert.equal(m.has('game'), false);
});

test('Phase16: SaveManager handles corrupt JSON gracefully', () => {
  const store = new InMemoryStorage();
  store.setItem('sproutvalley_broken', '{not valid json');
  const m = new SaveManager(store);
  const result = m.load('broken');
  assert.equal(result, null);
});

test('Phase16: SaveManager has no overlap with non-namespaced keys', () => {
  const store = new InMemoryStorage();
  store.setItem('unrelated_app_setting', 'preserved');
  store.setItem('sproutvalley_app_setting', 'managed');
  const m = new SaveManager(store);
  m.remove('app_setting');
  assert.equal(store.getItem('unrelated_app_setting'), 'preserved');
  assert.equal(store.getItem('sproutvalley_app_setting'), null);
});

test('Phase16: Capacitor config file path uses androidScheme https for security', () => {
  const config = readJson(resolve(projectRoot, 'capacitor.config.json'));
  assert.equal(config.server.androidScheme, 'https',
    'androidScheme https avoids file:// CORS issues');
});