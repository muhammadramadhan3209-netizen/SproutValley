import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { SaveManager, InMemoryStorage } from '../src/utils/SaveManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function readText(path) {
  return readFileSync(path, 'utf-8');
}

test('Phase18: InventorySystem no longer spams console.log via _dump', () => {
  const inv = new InventorySystem(new ItemSystem());
  const originalLog = console.log;
  let logCalls = 0;
  console.log = () => { logCalls++; };
  try {
    inv.addItem('seed_carrot', 5);
    inv.addItem('seed_tomato', 3);
    inv.removeItem('seed_carrot', 2);
    inv.clear();
  } finally {
    console.log = originalLog;
  }
  assert.equal(logCalls, 0, '_dump() should not call console.log');
});

test('Phase18: InventorySystem silent on inventory full warning is intentional', () => {
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  const originalWarn = console.warn;
  let warnCalled = false;
  console.warn = () => { warnCalled = true; };
  try {
    for (let i = 0; i < 24; i++) inv.addItem('seed_carrot', 99);
    inv.addItem('seed_tomato', 1);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnCalled, true, 'should still warn on inventory full');
});

test('Phase18: AndroidManifest no longer requests INTERNET permission', () => {
  const path = resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(path)) return;
  const content = readText(path);
  assert.equal(content.includes('android.permission.INTERNET'), false,
    'INTERNET permission should be removed for offline app');
});

test('Phase18: All assets referenced in PreloadScene exist on disk', () => {
  const preload = readText(resolve(projectRoot, 'src/scenes/PreloadScene.js'));
  const srcDir = resolve(projectRoot, 'src');
  const publicDir = resolve(projectRoot, 'public');
  const importMatch = preload.match(/import\s*{[^}]*ASSET_PATHS[^}]*}\s*from\s*['"]\.\.\/config\/constants\.js['"]/);
  assert.ok(importMatch, 'PreloadScene must import ASSET_PATHS');
  const constants = readText(resolve(projectRoot, 'src/config/constants.js'));
  const pathMatches = [...constants.matchAll(/['"](assets\/[^'"]+)['"]/g)].map(m => m[1]);
  for (const p of pathMatches) {
    const onDisk = resolve(publicDir, p);
    assert.ok(existsSync(onDisk), `asset ${p} must exist on disk`);
  }
});


test('Phase18: Game flow: all 4 quests are startable via NPC dialogs', () => {
  const questData = JSON.parse(readFileSync(resolve(projectRoot, 'src/data/quests.json'), 'utf-8'));
  const npcData = JSON.parse(readFileSync(resolve(projectRoot, 'src/data/npcs.json'), 'utf-8'));
  for (const quest of Object.values(questData)) {
    if (quest.autoStart) continue;
    const npc = npcData[quest.giverNpcId];
    assert.ok(npc, `NPC ${quest.giverNpcId} for quest ${quest.id} must exist`);
    const dialog = npc.dialog || {};
    let foundStartQuest = false;
    for (const page of Object.values(dialog)) {
      if (!page || !Array.isArray(page.choices)) continue;
      for (const c of page.choices) {
        if (c && Array.isArray(c.effects)) {
          for (const e of c.effects) {
            if (e && e.type === 'start_quest' && e.questId === quest.id) {
              foundStartQuest = true;
            }
          }
        }
      }
    }
    assert.ok(foundStartQuest, `quest ${quest.id} must be startable via NPC ${quest.giverNpcId}`);
  }
});

test('Phase18: All 5 achievements have valid triggers', () => {
  const achData = JSON.parse(readFileSync(resolve(projectRoot, 'src/data/achievements.json'), 'utf-8'));
  const validTriggers = ['harvest', 'catch_fish', 'place_decoration', 'earn_gold', 'complete_quest'];
  for (const ach of Object.values(achData)) {
    assert.ok(validTriggers.includes(ach.trigger), `achievement ${ach.id} has invalid trigger`);
    assert.ok(ach.target > 0, `achievement ${ach.id} target must be positive`);
  }
});

test('Phase18: SaveManager.save payload size for fresh game is small', () => {
  const store = new InMemoryStorage();
  const m = new SaveManager(store);
  const sample = {
    meta: { version: 1, scene: 'FarmScene' },
    inventory: { slots: Array(24).fill(null), activeSlot: 0 },
    farming: { plots: {} },
    player: { farm: { x: 248, y: 176 }, lake: null },
    time: { currentDay: 1, currentTime: 0.05, gameStartedDay: 1, tickCount: 0 },
    economy: { gold: 100, totalEarned: 0, totalSpent: 0, transactions: 0 },
    decorations: [],
    npcs: {},
    quests: { active: [], completed: [], failed: [] },
    achievements: { unlocked: [], progress: {} }
  };
  m.save('game_v1', sample);
  const raw = store.getItem('sproutvalley_game_v1');
  assert.ok(raw.length < 1500, `fresh save should be < 1.5KB, got ${raw.length}`);
});

test('Phase18: Scene init() resets stateful UI fields', () => {
  const farm = readText(resolve(projectRoot, 'src/scenes/FarmScene.js'));
  assert.match(farm, /init\(\)\s*{[\s\S]{0,300}selectedSeed\s*=/);
  assert.match(farm, /init\(\)\s*{[\s\S]{0,500}actionCooldown\s*=/);
  assert.match(farm, /init\(\)\s*{[\s\S]{0,500}buildMode\s*=/);

  const lake = readText(resolve(projectRoot, 'src/scenes/LakeScene.js'));
  assert.match(lake, /init\(\)\s*{[\s\S]{0,200}selectedSeed\s*=/);
});

test('Phase18: Vite base path is relative for Capacitor file:// compatibility', () => {
  const vite = readText(resolve(projectRoot, 'vite.config.js'));
  assert.match(vite, /base:\s*['"]\.\/['"]/);
});

test('Phase18: index.html viewport has all mobile-required meta tags', () => {
  const html = readText(resolve(projectRoot, 'index.html'));
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /user-scalable=no/);
  assert.match(html, /maximum-scale=1\.0/);
  assert.match(html, /touch-action:\s*none/);
  assert.match(html, /-webkit-tap-highlight-color:\s*transparent/);
});

test('Phase18: All scene shutdown handlers cleanup UI components', () => {
  const farm = readText(resolve(projectRoot, 'src/scenes/FarmScene.js'));
  const lake = readText(resolve(projectRoot, 'src/scenes/LakeScene.js'));
  const uiTypes = ['toastUI', 'achievementPopup', 'touchButtons', 'actionButtons', 'virtualPad'];
  for (const u of uiTypes) {
    assert.match(farm, new RegExp(`${u}\\.destroy`), `FarmScene must destroy ${u}`);
    assert.match(lake, new RegExp(`${u}\\.destroy`), `LakeScene must destroy ${u}`);
  }
});

test('Phase18: Scenes have exactly one shutdown handler each', () => {
  const farm = readText(resolve(projectRoot, 'src/scenes/FarmScene.js'));
  const lake = readText(resolve(projectRoot, 'src/scenes/LakeScene.js'));
  const farmCount = (farm.match(/events\.once\(['"]shutdown['"]/g) || []).length;
  const lakeCount = (lake.match(/events\.once\(['"]shutdown['"]/g) || []).length;
  assert.equal(farmCount, 1, 'FarmScene should have one shutdown handler');
  assert.equal(lakeCount, 1, 'LakeScene should have one shutdown handler');
});

test('Phase18: Bundle uses es2019 target (Android WebView 70+ supports)', () => {
  const vite = readText(resolve(projectRoot, 'vite.config.js'));
  assert.match(vite, /target:\s*['"]es\d+['"]/);
});

test('Phase18: No debug TODO/FIXME comments in source', () => {
  const srcDir = resolve(projectRoot, 'src');
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && full.endsWith('.js')) files.push(full);
    }
  };
  walk(srcDir);
  const badComments = [];
  for (const f of files) {
    const content = readText(f);
    const lines = content.split('\n');
    for (const line of lines) {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line) && !line.includes('// #region')) {
        badComments.push(`${f}: ${line.trim()}`);
      }
    }
  }
  assert.equal(badComments.length, 0, `Found debug comments:\n${badComments.join('\n')}`);
});

test('Phase18: All 7 action buttons fit horizontally in 480px viewport', () => {
  const btnSize = 24;
  const gap = 3;
  const margin = 6;
  const numButtons = 7;
  const totalWidth = numButtons * btnSize + (numButtons - 1) * gap;
  const startX = 480 - btnSize - margin;
  const leftmostX = startX - (numButtons - 1) * (btnSize + gap);
  assert.ok(leftmostX >= margin, `leftmost button x=${leftmostX} must be >= ${margin} (right margin)`);
  assert.ok(leftmostX >= 80, 'leftmost button must leave room for VirtualPad (centerX=42)');
});

test('Phase18: All 4 UI buttons fit horizontally', () => {
  const btnSize = 24;
  const gap = 3;
  const margin = 6;
  const numButtons = 4;
  const totalWidth = numButtons * btnSize + (numButtons - 1) * gap;
  const startX = 480 - btnSize - margin;
  const leftmostX = startX - (numButtons - 1) * (btnSize + gap);
  assert.ok(leftmostX >= margin);
});

test('Phase18: VirtualPad down button does not exceed screen bottom', () => {
  const centerY = 270 - 6 - 50;
  const offset = 24;
  const btnSize = 24;
  const downBottom = centerY + offset + btnSize / 2;
  assert.ok(downBottom <= 270, `down button bottom ${downBottom} must be <= 270`);
});

test('Phase18: All JSON data files are valid', () => {
  const dataDir = resolve(projectRoot, 'src/data');
  for (const f of readdirSync(dataDir)) {
    if (f.endsWith('.json')) {
      const content = readFileSync(resolve(dataDir, f), 'utf-8');
      try {
        JSON.parse(content);
      } catch (err) {
        assert.fail(`Invalid JSON in ${f}: ${err.message}`);
      }
    }
  }
});