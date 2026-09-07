import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FishingSystem, FISH_STATE } from '../src/systems/FishingSystem.js';
import { DecorationSystem } from '../src/systems/DecorationSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { QuestSystem } from '../src/systems/QuestSystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import fishData from '../src/data/fish.json' with { type: 'json' };
import { TILE_SIZE, TILE_WATER } from '../src/config/constants.js';

function makeMockScene() {
  const fakeText = () => {
    const t = {
      setOrigin() { return t; },
      setDepth() { return t; },
      setAlpha() { return t; },
      setY() {},
      destroy() {}
    };
    return t;
  };
  return {
    time: { now: 0, delayedCall: () => ({ remove() {} }) },
    add: {
      image: () => ({
        setOrigin() { return this; },
        setDisplaySize() { return this; },
        setDepth() { return this; },
        setTexture() { return this; },
        setVisible() { return this; },
        setAlpha() { return this; },
        setPosition() { return this; },
        destroy() {}
      }),
      text: fakeText,
      container: () => ({ list: [], setDepth() { return this; } })
    },
    groundLayer: { list: [] }
  };
}

function makeTileMapWithWater() {
  const width = 6;
  const height = 4;
  const tileMap = [];
  for (let y = 0; y < height; y++) {
    tileMap[y] = [];
    for (let x = 0; x < width; x++) {
      tileMap[y][x] = (x >= 1 && x <= 4 && y >= 1 && y <= 2) ? TILE_WATER : 0;
    }
  }
  return tileMap;
}

function makeFishing() {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  const tileMap = makeTileMapWithWater();
  const fishing = new FishingSystem(scene, tileMap, inv, fishData);
  return { scene, inv, tileMap, fishing };
}

function forceBite(fishing, scene) {
  fishing.state = FISH_STATE.BITE;
  fishing.biteAt = scene.time.now;
}

function setupFishingQuestWiring(fishing, quest) {
  fishing.onCatch = (fish) => {
    const completed = quest.reportProgress('catch_fish', fish.id, 1);
    return completed;
  };
}

test('Integration: fishing catch increments fisher_friend progress', () => {
  const { scene, fishing, inv } = makeFishing();
  const quest = new QuestSystem();
  quest.startQuest('fisher_friend');
  setupFishingQuestWiring(fishing, quest);

  const totalBefore = inv.countItem('fish_common_brown') + inv.countItem('fish_common_orange')
    + inv.countItem('fish_uncommon_blue') + inv.countItem('fish_uncommon_cyan')
    + inv.countItem('fish_rare_gold') + inv.countItem('fish_rare_treasure');

  forceBite(fishing, scene);
  const r = fishing.tryCatch({ x: 16, y: 16 });

  const totalAfter = inv.countItem('fish_common_brown') + inv.countItem('fish_common_orange')
    + inv.countItem('fish_uncommon_blue') + inv.countItem('fish_uncommon_cyan')
    + inv.countItem('fish_rare_gold') + inv.countItem('fish_rare_treasure');

  assert.equal(r.ok, true);
  assert.ok(totalAfter > totalBefore, 'inventory should contain at least one fish after catch');
  const p = quest.progressFor('fisher_friend');
  assert.equal(p.objectives['catch_fish'] || 0, 1);
  assert.equal(quest.isCompleted('fisher_friend'), false);
});

test('Integration: three fishing catches complete fisher_friend', () => {
  const { scene, fishing, inv } = makeFishing();
  const quest = new QuestSystem();
  quest.startQuest('fisher_friend');
  setupFishingQuestWiring(fishing, quest);

  for (let i = 0; i < 3; i++) {
    inv.removeItem('fish_common_brown', inv.countItem('fish_common_brown'));
    inv.removeItem('fish_common_orange', inv.countItem('fish_common_orange'));
    forceBite(fishing, scene);
    const r = fishing.tryCatch({ x: 16, y: 16 });
    assert.equal(r.ok, true);
    assert.ok(r.fish, 'should catch a fish');
  }

  assert.equal(quest.isCompleted('fisher_friend'), true);
});

function setupDecorationQuestWiring(decoration, quest) {
  return decoration.onChange((event) => {
    if (event !== 'place') return;
    const completed = quest.reportProgress('place_decoration', null, 1);
    return completed;
  });
}

test('Integration: placing decoration increments decorator progress', () => {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  inv.addItem('decoration_wood_fence', 5);
  const dec = new DecorationSystem(scene, items, inv);
  const quest = new QuestSystem();
  quest.startQuest('decorator');
  setupDecorationQuestWiring(dec, quest);

  dec.place('decoration_wood_fence', 16, 16);
  assert.equal(quest.progressFor('decorator').objectives['place_decoration'] || 0, 1);

  dec.place('decoration_wood_fence', 32, 16);
  assert.equal(quest.progressFor('decorator').objectives['place_decoration'] || 0, 2);
  assert.equal(quest.isCompleted('decorator'), false);
});

test('Integration: placing 3 decorations completes decorator quest', () => {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  inv.addItem('decoration_lamp', 5);
  const dec = new DecorationSystem(scene, items, inv);
  const quest = new QuestSystem();
  quest.startQuest('decorator');
  setupDecorationQuestWiring(dec, quest);

  dec.place('decoration_lamp', 0, 0);
  dec.place('decoration_lamp', 16, 0);
  dec.place('decoration_lamp', 32, 0);

  assert.equal(quest.isCompleted('decorator'), true);
});

test('Integration: removing decoration does not increase place_decoration progress', () => {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  inv.addItem('decoration_lamp', 5);
  const dec = new DecorationSystem(scene, items, inv);
  const quest = new QuestSystem();
  quest.startQuest('decorator');
  setupDecorationQuestWiring(dec, quest);

  dec.place('decoration_lamp', 0, 0);
  dec.remove(0, 0);
  dec.place('decoration_lamp', 16, 0);

  assert.equal(quest.progressFor('decorator').objectives['place_decoration'] || 0, 2);
});

function setupEconomyQuestWiring(economy, quest) {
  return economy.onChange((event, data) => {
    if (event !== 'earn') return;
    if (data && typeof data.reason === 'string' && data.reason.startsWith('quest:')) return;
    if (!data || !Number.isFinite(data.amount) || data.amount <= 0) return;
    const completed = quest.reportProgress('earn_gold', null, data.amount);
    return completed;
  });
}

test('Integration: earning gold increments first_gold progress', () => {
  const items = new ItemSystem();
  const econ = new EconomySystem(items);
  const quest = new QuestSystem();
  quest.startQuest('first_gold');
  setupEconomyQuestWiring(econ, quest);

  econ.addGold(100, 'sell:carrot');
  assert.equal(quest.progressFor('first_gold').objectives['earn_gold'] || 0, 100);

  econ.addGold(50, 'sell:tomato');
  assert.equal(quest.progressFor('first_gold').objectives['earn_gold'] || 0, 150);
  assert.equal(quest.isCompleted('first_gold'), false);
});

test('Integration: total gold >= 200 completes first_gold', () => {
  const items = new ItemSystem();
  const econ = new EconomySystem(items);
  const quest = new QuestSystem();
  quest.startQuest('first_gold');
  setupEconomyQuestWiring(econ, quest);

  econ.addGold(150, 'sell:fish');
  assert.equal(quest.isCompleted('first_gold'), false);

  econ.addGold(60, 'sell:carrot');
  assert.equal(quest.isCompleted('first_gold'), true);
});

test('Integration: quest reward gold is NOT counted as earn_gold', () => {
  const items = new ItemSystem();
  const econ = new EconomySystem(items);
  const quest = new QuestSystem();
  quest.startQuest('first_gold');
  setupEconomyQuestWiring(econ, quest);

  econ.addGold(150, 'sell:carrot');
  assert.equal(quest.progressFor('first_gold').objectives['earn_gold'] || 0, 150);

  econ.addGold(60, 'sell:tomato');
  assert.equal(quest.isCompleted('first_gold'), true);
  const completedBefore = quest.getCompleted().find(q => q.id === 'first_gold');
  const progressBeforeReward = completedBefore.progress['earn_gold'];

  const r = quest.applyReward('first_gold', econ, null);
  assert.equal(r.ok, true);

  const completedAfter = quest.getCompleted().find(q => q.id === 'first_gold');
  assert.equal(completedAfter.progress['earn_gold'], progressBeforeReward,
    'progress on completed quest must not change from reward gold (reason quest:)');

  const earnedTotal = completedAfter.progress['earn_gold'];
  assert.ok(earnedTotal >= 200 && earnedTotal < 250,
    `expected earned in [200,250), got ${earnedTotal}`);
});

test('Integration: refund gold is also not double-counted (reason quest: filter is safe for non-quest too)', () => {
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  const econ = new EconomySystem(items);
  const quest = new QuestSystem();
  quest.startQuest('first_gold');
  setupEconomyQuestWiring(econ, quest);

  econ.addGold(200, 'sell:carrot');
  assert.equal(quest.isCompleted('first_gold'), true);
});

test('Integration: unsubscribe stops decoration → quest listener', () => {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  inv.addItem('decoration_lamp', 5);
  const dec = new DecorationSystem(scene, items, inv);
  const quest = new QuestSystem();
  quest.startQuest('decorator');
  const off = setupDecorationQuestWiring(dec, quest);

  dec.place('decoration_lamp', 0, 0);
  assert.equal(quest.progressFor('decorator').objectives['place_decoration'] || 0, 1);

  off();

  dec.place('decoration_lamp', 16, 0);
  dec.place('decoration_lamp', 32, 0);
  assert.equal(quest.progressFor('decorator').objectives['place_decoration'] || 0, 1);
  assert.equal(quest.isCompleted('decorator'), false);
});

test('Integration: unsubscribe stops economy → quest listener', () => {
  const items = new ItemSystem();
  const econ = new EconomySystem(items);
  const quest = new QuestSystem();
  quest.startQuest('first_gold');
  const off = setupEconomyQuestWiring(econ, quest);

  econ.addGold(100, 'sell:carrot');
  assert.equal(quest.progressFor('first_gold').objectives['earn_gold'] || 0, 100);

  off();

  econ.addGold(100, 'sell:tomato');
  assert.equal(quest.progressFor('first_gold').objectives['earn_gold'] || 0, 100);
});