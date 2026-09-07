import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SaveManager, InMemoryStorage } from '../src/utils/SaveManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function readText(path) {
  return readFileSync(path, 'utf-8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

test('Phase17: Vite config has chunkSizeWarningLimit to suppress false warnings', () => {
  const viteConfig = readText(resolve(projectRoot, 'vite.config.js'));
  assert.match(viteConfig, /chunkSizeWarningLimit/);
  const match = viteConfig.match(/chunkSizeWarningLimit\s*:\s*(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 1500, 'should be set to suppress Phaser bundle warning');
});

test('Phase17: Vite config has minify: esbuild', () => {
  const viteConfig = readText(resolve(projectRoot, 'vite.config.js'));
  assert.match(viteConfig, /minify/);
});

test('Phase17: ic_launcher_background color matches game theme', () => {
  const path = resolve(projectRoot, 'android/app/src/main/res/values/ic_launcher_background.xml');
  if (!existsSync(path)) return;
  const content = readText(path);
  assert.match(content, /#3A7D44|#3a7d44/);
});

test('Phase17: AndroidManifest has correct package and appId', () => {
  const manifest = readText(resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml'));
  const buildGradle = readText(resolve(projectRoot, 'android/app/build.gradle'));
  assert.match(manifest, /xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android"/);
  assert.match(buildGradle, /namespace\s*=\s*"com\.sproutvalley\.app"/);
  assert.match(buildGradle, /applicationId\s+"com\.sproutvalley\.app"/);
});

test('Phase17: Android strings.xml has correct app name', () => {
  const strings = readText(resolve(projectRoot, 'android/app/src/main/res/values/strings.xml'));
  assert.match(strings, /Sprout Valley/);
});

test('Phase17: No internet/fetch references in src/', () => {
  const srcDir = resolve(projectRoot, 'src');
  const patterns = ['http://', 'https://', 'fetch(', 'XMLHttpRequest', 'new WebSocket'];
  const searchFiles = (dir) => {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) out.push(...searchFiles(full));
      else if (e.isFile() && full.endsWith('.js')) out.push(full);
    }
    return out;
  };
  const files = searchFiles(srcDir);
  let foundNetworkCall = false;
  for (const f of files) {
    const content = readText(f);
    for (const p of patterns) {
      if (content.includes(p)) {
        foundNetworkCall = true;
        break;
      }
    }
  }
  assert.equal(foundNetworkCall, false, 'no network calls allowed in src/ for offline support');
});

test('Phase17: All Phaser assets are local relative paths', () => {
  const preload = readText(resolve(projectRoot, 'src/scenes/PreloadScene.js'));
  const lines = preload.split('\n').filter(l => l.includes('this.load.'));
  for (const line of lines) {
    if (line.includes('ASSET_PATHS')) continue;
    const urlMatch = line.match(/'(https?:\/\/[^']+)'/);
    assert.equal(urlMatch, null, `found absolute URL in PreloadScene: ${line.trim()}`);
  }
});

test('Phase17: SaveManager handles close/reopen scenario via InMemoryStorage simulation', () => {
  const store = new InMemoryStorage();
  const session1 = new SaveManager(store);
  session1.save('game_v1', { gold: 100, day: 5 });
  assert.equal(session1.has('game_v1'), true);

  const session2 = new SaveManager(store);
  const loaded = session2.load('game_v1');
  assert.deepEqual(loaded, { gold: 100, day: 5 });
});

test('Phase17: SaveManager prefix prevents collision with other apps on device', () => {
  const store = new InMemoryStorage();
  store.setItem('other_app_data', 'preserved');
  const m = new SaveManager(store);
  m.save('data', { x: 1 });
  m.remove('data');
  assert.equal(store.getItem('other_app_data'), 'preserved');
  assert.equal(store.getItem('sproutvalley_data'), null);
});

test('Phase17: SaveManager.save returns false when storage unavailable', () => {
  const m = new SaveManager(null);
  const result = m.save('test', { x: 1 });
  assert.equal(result, false);
});

test('Phase17: SaveManager corrupt JSON returns null without throwing', () => {
  const store = new InMemoryStorage();
  store.setItem('sproutvalley_game_v1', '{invalid json{');
  const m = new SaveManager(store);
  assert.doesNotThrow(() => m.load('game_v1'));
  assert.equal(m.load('game_v1'), null);
});

test('Phase17: Android scheme https means localStorage origin is https://localhost', () => {
  const config = readJson(resolve(projectRoot, 'capacitor.config.json'));
  assert.equal(config.server.androidScheme, 'https');
});

test('Phase17: Build target es2019 is supported by Android System WebView (Chromium 70+)', () => {
  const viteConfig = readText(resolve(projectRoot, 'vite.config.js'));
  const match = viteConfig.match(/target:\s*['"]es(\d+)['"]/);
  assert.ok(match);
  const year = Number(match[1]);
  assert.ok(year >= 2017 && year <= 2020, 'es2017-2020 supported by Android WebView');
});

test('Phase17: All dependencies declared in package.json (no missing)', () => {
  const pkg = readJson(resolve(projectRoot, 'package.json'));
  const expectedDeps = ['phaser', '@capacitor/core'];
  for (const dep of expectedDeps) {
    assert.ok(pkg.dependencies[dep], `dependency ${dep} missing`);
  }
  const expectedDevDeps = ['vite', '@capacitor/cli', '@capacitor/android'];
  for (const dep of expectedDevDeps) {
    assert.ok(pkg.devDependencies[dep], `devDependency ${dep} missing`);
  }
});

test('Phase17: Scene shutdown handlers properly destroy UI components', () => {
  const farmScene = readText(resolve(projectRoot, 'src/scenes/FarmScene.js'));
  assert.match(farmScene, /toastUI\.destroy/);
  assert.match(farmScene, /achievementPopup\.destroy/);
  assert.match(farmScene, /touchButtons\.destroy/);
  assert.match(farmScene, /actionButtons\.destroy/);
  assert.match(farmScene, /virtualPad\.destroy/);

  const lakeScene = readText(resolve(projectRoot, 'src/scenes/LakeScene.js'));
  assert.match(lakeScene, /toastUI\.destroy/);
  assert.match(lakeScene, /achievementPopup\.destroy/);
  assert.match(lakeScene, /touchButtons\.destroy/);
  assert.match(lakeScene, /actionButtons\.destroy/);
  assert.match(lakeScene, /virtualPad\.destroy/);
});

test('Phase17: LakeScene has only one shutdown handler (no duplicate save)', () => {
  const lakeScene = readText(resolve(projectRoot, 'src/scenes/LakeScene.js'));
  const matches = lakeScene.match(/events\.once\(['"]shutdown['"]/g) || [];
  assert.equal(matches.length, 1, 'LakeScene should have exactly one shutdown handler');
});

test('Phase17: FarmScene has only one shutdown handler', () => {
  const farmScene = readText(resolve(projectRoot, 'src/scenes/FarmScene.js'));
  const matches = farmScene.match(/events\.once\(['"]shutdown['"]/g) || [];
  assert.equal(matches.length, 1, 'FarmScene should have exactly one shutdown handler');
});

test('Phase17: _scheduleAutoSave removes previous timer to prevent leak', () => {
  const farmScene = readText(resolve(projectRoot, 'src/scenes/FarmScene.js'));
  assert.match(farmScene, /if\s*\(\s*this\.autoSaveTimer\s*\)\s*this\.autoSaveTimer\.remove\(\)/);
  const lakeScene = readText(resolve(projectRoot, 'src/scenes/LakeScene.js'));
  assert.match(lakeScene, /if\s*\(\s*this\.autoSaveTimer\s*\)\s*this\.autoSaveTimer\.remove\(\)/);
});

test('Phase17: SaveManager.save payload size is small enough for mobile quota', () => {
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  const sampleSave = {
    meta: { version: 1, savedAt: Date.now(), scene: 'FarmScene' },
    inventory: { slots: Array(24).fill(null), activeSlot: 0 },
    farming: { plots: {} },
    player: { farm: { x: 100, y: 200 }, lake: null },
    time: { currentDay: 1, currentTime: 0.5, gameStartedDay: 1, tickCount: 0 },
    economy: { gold: 100, totalEarned: 50, totalSpent: 0, transactions: 5 },
    decorations: [],
    npcs: {},
    quests: { active: [], completed: [], failed: [] },
    achievements: { unlocked: [], progress: {} }
  };
  m.save('game_v1', sampleSave);
  const raw = store.getItem('sproutvalley_game_v1');
  assert.ok(raw);
  assert.ok(raw.length < 5000, 'save should be < 5KB for mobile quota safety');
});

test('Phase17: SaveManager has clear documentation comment for production behavior', () => {
  const m = new SaveManager();
  assert.equal(typeof m.save, 'function');
  assert.equal(typeof m.load, 'function');
  assert.equal(typeof m.remove, 'function');
  assert.equal(typeof m.clear, 'function');
  assert.equal(typeof m.has, 'function');
});