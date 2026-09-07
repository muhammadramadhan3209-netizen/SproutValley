import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeScene } from './helpers/sceneStub.js';
import { SHEETS, PLAYER_BODY, PLAYER_DIRECTIONS, playerAnimationDefinitions, groundFrame, HOUSE_LAYERS } from '../src/config/assetFrames.js';
import { CROP_LAYOUT, FARM_WORLD, LAKE_WORLD, TILE_SIZE } from '../src/config/constants.js';
import { landscapeSize } from '../src/config/mobileLayout.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';

const require = createRequire(import.meta.url);
globalThis.Phaser = { AUTO: 0, Scene: class {}, Scale: require('phaser/src/scale/const/index.js') };
const { PreloadScene } = await import('../src/scenes/PreloadScene.js');
const { gameConfig } = await import('../src/config/gameConfig.js');

function loadedSheets() {
  const scene = Object.assign(Object.create(PreloadScene.prototype), makeScene());
  const loaded = [];
  scene.load = { image() {}, spritesheet(key, path, config) { loaded.push({ key, path, config }); } };
  scene.preload();
  return loaded;
}
function pngSize(path) {
  const data = readFileSync(new URL('../public/' + path, import.meta.url));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test('Actual PreloadScene definitions fit the actual PNG dimensions', () => {
  const loaded = loadedSheets();
  assert.deepEqual(new Set(loaded.map(s => s.key)), new Set(Object.keys(SHEETS)));
  for (const { key, path, config } of loaded) {
    const size = pngSize(path);
    assert.deepEqual(size, { width: SHEETS[key].width, height: SHEETS[key].height }, key);
    assert.ok(config.frameWidth > 0 && config.frameHeight > 0);
    assert.equal(size.width % config.frameWidth, 0, key);
    assert.equal(size.height % config.frameHeight, 0, key);
  }
  const emoji = loaded.find(s => s.key === 'ui_emoji_sheet');
  assert.deepEqual(emoji.config, { frameWidth: 32, frameHeight: 32 });
});

test('Animation frames remain in the same facing column and contain both steps', () => {
  const definitions = playerAnimationDefinitions();
  assert.equal(definitions.length, 8);
  // Manually inspected positions on teemo 8 directions.png, middle row is rest.
  const expectedIdle = { down: 12, up: 8, left: 10, right: 14 };
  for (const [direction, idle] of Object.entries(expectedIdle)) {
    const rest = definitions.find(a => a.key === `player_idle_${direction}`);
    const walk = definitions.find(a => a.key === `player_walk_${direction}`);
    assert.deepEqual(rest.frames.map(f => f.frame), [idle]);
    assert.deepEqual(walk.frames.map(f => f.frame), [idle - 8, idle, idle + 8, idle]);
    assert.equal(new Set(walk.frames.map(f => f.frame)).size, 3);
    for (const frame of [...rest.frames, ...walk.frames]) {
      assert.ok(frame.frame >= 0 && frame.frame < 24);
      assert.equal(frame.frame % 8, PLAYER_DIRECTIONS[direction]);
    }
  }
  assert.ok(PLAYER_BODY.offsetX + PLAYER_BODY.width <= 16);
  assert.ok(PLAYER_BODY.offsetY + PLAYER_BODY.height <= 16);
});

test('Ground and house select valid tiles; house retains seven-by-five footprint', () => {
  assert.equal(TILE_SIZE, 16);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) {
    assert.ok([0, 1, 2].includes(groundFrame(0, x, y)));
    assert.equal(groundFrame(1, x, y), 0);
    assert.equal(groundFrame(2, x, y), 0);
  }
  for (const layer of HOUSE_LAYERS) layer.rows.forEach((row, y) => {
    assert.equal(row.length, 7);
    assert.ok(y + layer.y < 5);
    row.forEach(frame => assert.ok(frame >= 0 && frame < 35));
  });
});

test('Crop and item frames are valid and do not address quarter emoji frames', () => {
  for (const layout of Object.values(CROP_LAYOUT)) for (const col of layout.cols) {
    assert.ok(layout.row * 7 + col >= 0 && layout.row * 7 + col < 231);
  }
  const items = new ItemSystem();
  for (const id of items.listAll()) {
    const icon = items.getIcon(id), sheet = SHEETS[icon.sheet];
    assert.ok(sheet, id);
    assert.ok(icon.frame >= 0 && icon.frame < (sheet.width / sheet.frameWidth) * (sheet.height / sheet.frameHeight), id);
    assert.equal(icon.row * (sheet.width / sheet.frameWidth) + icon.col, icon.frame, id);
  }
  assert.equal(items.getIcon('harvest_carrot').frame, 6);
});

test('Landscape sizing uses FIT, centered pixels and a viewport within existing worlds', () => {
  assert.equal(gameConfig.scale.mode, Phaser.Scale.FIT);
  assert.equal(gameConfig.scale.autoCenter, Phaser.Scale.CENTER_BOTH);
  assert.equal(gameConfig.pixelArt, true);
  assert.equal(gameConfig.antialias, false);
  assert.equal(gameConfig.render.antialias, false);
  assert.ok(gameConfig.input.activePointers >= 2);
  for (const [w, h] of [[960, 540], [800, 360], [1024, 768], [2400, 1080], [360, 800]]) {
    const size = landscapeSize(w, h);
    assert.ok(size.width > size.height);
    assert.ok(Math.abs(size.width / size.height - Math.max(w, h) / Math.min(w, h)) < 0.01);
    for (const world of [FARM_WORLD, LAKE_WORLD]) {
      assert.ok(size.width <= world.width * TILE_SIZE);
      assert.ok(size.height <= world.height * TILE_SIZE);
    }
  }
});

test('Native launcher resolves to a landscape game and Capacitor bundles local content', async () => {
  // Use the XML parser already used by the installed Capacitor CLI.
  const cliRequire = createRequire(require.resolve('@capacitor/cli/package.json'));
  const { parseStringPromise } = cliRequire('xml2js');
  const document = await parseStringPromise(readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8'));
  const app = document.manifest.application[0];
  const launcher = app.activity.find(activity => activity['intent-filter']?.some(filter =>
    filter.action?.some(action => action.$['android:name'] === 'android.intent.action.MAIN') &&
    filter.category?.some(category => category.$['android:name'] === 'android.intent.category.LAUNCHER')));
  assert.ok(launcher);
  assert.equal(launcher.$['android:screenOrientation'], 'sensorLandscape');
  assert.equal(app.$['android:appCategory'], 'game');
  const capacitor = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(capacitor.webDir, 'dist');
  assert.equal(capacitor.server?.url, undefined);
  assert.equal(capacitor.android.allowMixedContent, false);
});
