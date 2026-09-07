import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem } from '../src/systems/SaveSystem.js';
import { SaveManager, InMemoryStorage } from '../src/utils/SaveManager.js';

function makeSystem() {
  const store = new InMemoryStorage();
  const sys = new SaveSystem(new SaveManager(store));
  return { sys, store };
}

test('SaveSystem: hasSave returns false before first save', () => {
  const { sys } = makeSystem();
  assert.equal(sys.hasSave(), false);
});

test('SaveSystem: saveGame then hasSave returns true', () => {
  const { sys } = makeSystem();
  sys.saveGame();
  assert.equal(sys.hasSave(), true);
});

test('SaveSystem: inventory snapshot roundtrip', () => {
  const { sys, store } = makeSystem();
  const slots = [
    { itemId: 'seed_carrot', quantity: 3 },
    null,
    { itemId: 'fish_common_brown', quantity: 1 },
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ];
  sys.setInventorySnapshot(slots, 2);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data, 'load should return data');
  assert.equal(data.inventory.activeSlot, 2);
  assert.equal(data.inventory.slots[0].itemId, 'seed_carrot');
  assert.equal(data.inventory.slots[0].quantity, 3);
  assert.equal(data.inventory.slots[2].itemId, 'fish_common_brown');
  assert.equal(data.inventory.slots[1], null);
});

test('SaveSystem: farming plots roundtrip preserves growth stage', () => {
  const { sys, store } = makeSystem();
  const plots = new Map();
  plots.set('20,6', {
    tx: 20,
    ty: 6,
    state: 'planted_watered',
    cropId: 'carrot',
    stage: 2,
    plantedAt: 5000,
    lastWateredAt: 5000,
    progress: 0
  });
  plots.set('21,6', {
    tx: 21,
    ty: 6,
    state: 'tilled_watered',
    cropId: null,
    stage: 0,
    plantedAt: 0,
    lastWateredAt: 5000,
    progress: 0
  });
  sys.setFarmingSnapshot(plots);
  sys.saveGame();

  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data.farming.plots['20,6']);
  assert.equal(data.farming.plots['20,6'].cropId, 'carrot');
  assert.equal(data.farming.plots['20,6'].stage, 2);
  assert.equal(data.farming.plots['21,6'].state, 'tilled_watered');
});

test('SaveSystem: corrupt JSON returns null without throwing', () => {
  const store = new InMemoryStorage();
  store.setItem('sproutvalley_game_v1', '{not valid json');
  const sys = new SaveSystem(new SaveManager(store));
  assert.doesNotThrow(() => sys.loadGame());
  assert.equal(sys.loadGame(), null);
});

test('SaveSystem: invalid version returns default fallback', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({ meta: { version: 99 }, inventory: { activeSlot: 0, slots: [] } })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(data);
  assert.equal(data.meta.version, 1);
});

test('SaveSystem: missing meta returns null', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({ inventory: { slots: [], activeSlot: 0 }, farming: { plots: {} } })
  );
  const sys = new SaveSystem(new SaveManager(store));
  assert.equal(sys.loadGame(), null);
});

test('SaveSystem: corrupt slot is dropped but rest loads', () => {
  const store = new InMemoryStorage();
  const valid = {
    meta: { version: 1, scene: 'FarmScene' },
    inventory: {
      activeSlot: 0,
      slots: [
        { itemId: 'seed_carrot', quantity: 2 },
        'corrupt slot',
        { itemId: 'harvest_tomato', quantity: 1 },
        null
      ]
    },
    farming: { plots: {} },
    player: { farm: null, lake: null }
  };
  while (valid.inventory.slots.length < 24) valid.inventory.slots.push(null);
  store.setItem('sproutvalley_game_v1', JSON.stringify(valid));
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(data);
  assert.equal(data.inventory.slots[0].itemId, 'seed_carrot');
  assert.equal(data.inventory.slots[1], null);
  assert.equal(data.inventory.slots[2].itemId, 'harvest_tomato');
});

test('SaveSystem: clearSave resets to default', () => {
  const { sys, store } = makeSystem();
  sys.saveGame();
  assert.equal(sys.hasSave(), true);
  sys.clearSave();
  assert.equal(sys.hasSave(), false);
  const data = sys.loadGame();
  assert.equal(data, null);
});

test('SaveSystem: player position roundtrip', () => {
  const { sys, store } = makeSystem();
  sys.setPlayerPosition('FarmScene', 123, 456);
  sys.setLastScene('LakeScene');
  sys.saveGame();

  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.equal(data.player.farm.x, 123);
  assert.equal(data.player.farm.y, 456);
  assert.equal(data.meta.scene, 'LakeScene');
});

test('SaveSystem: saveVersion is 1', () => {
  assert.equal(SaveSystem.VERSION, 1);
});

test('SaveSystem: restoreInventoryTo fills correct slots', () => {
  const { sys } = makeSystem();
  sys.setInventorySnapshot([
    { itemId: 'seed_carrot', quantity: 5 },
    null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null
  ], 0);
  const fakeInv = {
    slots: new Array(24).fill(null),
    activeSlot: 99
  };
  sys.restoreInventoryTo(fakeInv);
  assert.equal(fakeInv.slots[0].itemId, 'seed_carrot');
  assert.equal(fakeInv.slots[0].quantity, 5);
  assert.equal(fakeInv.activeSlot, 0);
});

test('SaveSystem: load without storage keeps default state', () => {
  const sys = new SaveSystem(new SaveManager(null));
  assert.equal(sys.hasSave(), false);
  assert.equal(sys.loadGame(), null);
});

test('SaveSystem: invalid player coord is normalized to null', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: { x: 'not a number', y: null }, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.player.farm, null);
});
test('SaveSystem: time block roundtrip with TimeSystem', () => {
  const { sys, store } = makeSystem();
  const ts = { snapshot: () => ({ currentDay: 7, currentTime: 0.42, gameStartedDay: 1, tickCount: 1234 }) };
  sys.setTimeSnapshot(ts);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data.time);
  assert.equal(data.time.currentDay, 7);
  assert.equal(data.time.currentTime, 0.42);
  assert.equal(data.time.gameStartedDay, 1);
  assert.equal(data.time.tickCount, 1234);
});

test('SaveSystem: restoreTimeTo applies snapshot', () => {
  const { sys } = makeSystem();
  const ts = { snapshot: () => ({}) };
  sys.setTimeSnapshot(ts);
  const target = {
    snapshot: () => null,
    restore: (s) => {
      target.received = s;
      return true;
    }
  };
  target.received = null;
  const ok = sys.restoreTimeTo(target);
  assert.equal(ok, true);
  assert.ok(target.received);
});

test('SaveSystem: missing time block falls back to defaults', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(data.time);
  assert.equal(data.time.currentDay, 1);
});

test('SaveSystem: corrupt time values clamped', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      time: { currentDay: -10, currentTime: 99, gameStartedDay: 0, tickCount: -5 }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.time.currentDay, 1);
  assert.ok(data.time.currentTime >= 0 && data.time.currentTime < 1);
  assert.equal(data.time.gameStartedDay, 1);
  assert.equal(data.time.tickCount, 0);
});

test('SaveSystem: economy block roundtrip', () => {
  const { sys, store } = makeSystem();
  const econ = { snapshot: () => ({ gold: 250, totalEarned: 500, totalSpent: 250, transactions: 10 }) };
  sys.setEconomySnapshot(econ);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data.economy);
  assert.equal(data.economy.gold, 250);
  assert.equal(data.economy.totalEarned, 500);
  assert.equal(data.economy.totalSpent, 250);
  assert.equal(data.economy.transactions, 10);
});

test('SaveSystem: restoreEconomyTo applies snapshot', () => {
  const { sys } = makeSystem();
  const econ = { snapshot: () => ({}) };
  sys.setEconomySnapshot(econ);
  const target = {
    snapshot: () => null,
    restore: (s) => { target.received = s; return true; }
  };
  target.received = null;
  const ok = sys.restoreEconomyTo(target);
  assert.equal(ok, true);
  assert.ok(target.received);
});

test('SaveSystem: missing economy block falls back to defaults', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(data.economy);
  assert.equal(typeof data.economy.gold, 'number');
});

test('SaveSystem: corrupt economy values clamped', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      economy: { gold: -50, totalEarned: 'foo', totalSpent: -10, transactions: -5 }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.economy.gold, 0);
  assert.equal(data.economy.totalEarned, 0);
  assert.equal(data.economy.totalSpent, 0);
  assert.equal(data.economy.transactions, 0);
});

test('SaveSystem: decorations block roundtrip', () => {
  const { sys, store } = makeSystem();
  const dec = {
    snapshot: () => [
      { id: 'decoration_wood_fence', x: 32, y: 64 },
      { id: 'decoration_lamp', x: 80, y: 16 }
    ]
  };
  sys.setDecorationSnapshot(dec);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(Array.isArray(data.decorations));
  assert.equal(data.decorations.length, 2);
  assert.deepEqual(data.decorations[0], { id: 'decoration_wood_fence', x: 32, y: 64 });
  assert.deepEqual(data.decorations[1], { id: 'decoration_lamp', x: 80, y: 16 });
});

test('SaveSystem: restoreDecorationsTo applies snapshot', () => {
  const { sys } = makeSystem();
  const dec = { snapshot: () => [] };
  sys.setDecorationSnapshot(dec);
  const target = {
    snapshot: () => null,
    restore: (s) => { target.received = s; return true; }
  };
  target.received = null;
  const ok = sys.restoreDecorationsTo(target);
  assert.equal(ok, true);
  assert.ok(target.received);
});

test('SaveSystem: missing decorations block falls back to empty array', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(Array.isArray(data.decorations));
  assert.equal(data.decorations.length, 0);
});

test('SaveSystem: corrupt decoration entries dropped, valid kept', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      decorations: [
        { id: 'decoration_wood_fence', x: 0, y: 0 },
        { id: '', x: 0, y: 0 },
        { id: 'decoration_lamp', x: NaN, y: 0 },
        'not an object',
        null,
        { id: 'decoration_lamp', x: 32, y: 32 }
      ]
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.decorations.length, 2);
  assert.deepEqual(data.decorations[0], { id: 'decoration_wood_fence', x: 0, y: 0 });
  assert.deepEqual(data.decorations[1], { id: 'decoration_lamp', x: 32, y: 32 });
});

test('SaveSystem: decoration coordinates clamped to integer', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      decorations: [
        { id: 'decoration_wood_fence', x: 15.7, y: 32.3 }
      ]
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.decorations[0].x, 15);
  assert.equal(data.decorations[0].y, 32);
});

test('SaveSystem: npc block roundtrip', () => {
  const { sys, store } = makeSystem();
  const npc = { snapshot: () => ({ farmer_ada: { met: true, lastDialogPageId: 'trade' } }) };
  sys.setNpcSnapshot(npc);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data.npcs);
  assert.equal(data.npcs.farmer_ada.met, true);
  assert.equal(data.npcs.farmer_ada.lastDialogPageId, 'trade');
});

test('SaveSystem: restoreNpcsTo applies snapshot', () => {
  const { sys } = makeSystem();
  const npc = { snapshot: () => ({}) };
  sys.setNpcSnapshot(npc);
  const target = {
    snapshot: () => null,
    restore: (s) => { target.received = s; return true; }
  };
  target.received = null;
  const ok = sys.restoreNpcsTo(target);
  assert.equal(ok, true);
  assert.ok(target.received);
});

test('SaveSystem: missing npc block falls back to empty object', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(typeof data.npcs === 'object');
  assert.equal(Object.keys(data.npcs).length, 0);
});

test('SaveSystem: corrupt npc entries dropped', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      npcs: {
        'farmer_ada': { met: true, lastDialogPageId: 'trade' },
        'bad_npc': null,
        '': { met: true },
        'merchant_tom': 'not an object',
        'fisher_jo': { met: false, lastDialogPageId: null }
      }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(data.npcs.farmer_ada);
  assert.ok(!data.npcs.bad_npc);
  assert.ok(!data.npcs['']);
  assert.ok(!data.npcs.merchant_tom);
  assert.ok(data.npcs.fisher_jo);
});

test('SaveSystem: quest block roundtrip', () => {
  const { sys, store } = makeSystem();
  const quest = {
    snapshot: () => ({
      active: [{ id: 'first_harvest', startedDay: 1, completedDay: null, objectives: { harvest_carrot: 1 }, state: 'active' }],
      completed: [],
      failed: []
    })
  };
  sys.setQuestSnapshot(quest);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data.quests);
  assert.equal(data.quests.active.length, 1);
  assert.equal(data.quests.active[0].id, 'first_harvest');
  assert.equal(data.quests.active[0].objectives.harvest_carrot, 1);
});

test('SaveSystem: restoreQuestsTo applies snapshot', () => {
  const { sys } = makeSystem();
  const quest = { snapshot: () => ({ active: [], completed: [], failed: [] }) };
  sys.setQuestSnapshot(quest);
  const target = {
    snapshot: () => null,
    restore: (s) => { target.received = s; return true; }
  };
  target.received = null;
  const ok = sys.restoreQuestsTo(target);
  assert.equal(ok, true);
  assert.ok(target.received);
});

test('SaveSystem: missing quest block falls back to empty lists', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(Array.isArray(data.quests.active));
  assert.ok(Array.isArray(data.quests.completed));
  assert.ok(Array.isArray(data.quests.failed));
});

test('SaveSystem: corrupt quest entries dropped', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      quests: {
        active: [
          { id: 'first_harvest', objectives: { harvest_carrot: 1 }, startedDay: 1, state: 'active' },
          null,
          'not an object',
          { id: 123, objectives: {} },
          { id: 'fisher_friend', objectives: { catch_fish: 3 }, startedDay: 1, state: 'active' }
        ],
        completed: [],
        failed: []
      }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.quests.active.length, 2);
  assert.equal(data.quests.active[0].id, 'first_harvest');
  assert.equal(data.quests.active[1].id, 'fisher_friend');
});

test('SaveSystem: achievements block roundtrip', () => {
  const { sys, store } = makeSystem();
  const ach = {
    snapshot: () => ({
      unlocked: [
        { id: 'first_harvest', unlockedAtDay: 12345 },
        { id: 'fisherman', unlockedAtDay: 67890 }
      ],
      progress: { decorator: 4, rich_farmer: 250 }
    })
  };
  sys.setAchievementSnapshot(ach);
  sys.saveGame();
  const sys2 = new SaveSystem(new SaveManager(store));
  const data = sys2.loadGame();
  assert.ok(data.achievements);
  assert.equal(data.achievements.unlocked.length, 2);
  assert.equal(data.achievements.unlocked[0].id, 'first_harvest');
  assert.equal(data.achievements.unlocked[0].unlockedAtDay, 12345);
  assert.equal(data.achievements.progress['decorator'], 4);
  assert.equal(data.achievements.progress['rich_farmer'], 250);
});

test('SaveSystem: restoreAchievementsTo applies snapshot', () => {
  const { sys } = makeSystem();
  const ach = {
    snapshot: () => ({
      unlocked: [{ id: 'first_harvest', unlockedAtDay: 100 }],
      progress: { fisherman: 5 }
    })
  };
  sys.setAchievementSnapshot(ach);
  const target = {
    snapshot: () => null,
    restore: (s) => { target.received = s; return true; }
  };
  target.received = null;
  const ok = sys.restoreAchievementsTo(target);
  assert.equal(ok, true);
  assert.ok(target.received);
  assert.equal(target.received.unlocked.length, 1);
});

test('SaveSystem: missing achievements block falls back to defaults', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.ok(data.achievements);
  assert.ok(Array.isArray(data.achievements.unlocked));
  assert.equal(data.achievements.unlocked.length, 0);
  assert.equal(typeof data.achievements.progress, 'object');
});

test('SaveSystem: corrupt achievement entries dropped, valid kept', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      achievements: {
        unlocked: [
          { id: 'first_harvest', unlockedAtDay: 1 },
          null,
          'not an object',
          { id: '' },
          { id: 'fisherman', unlockedAtDay: 5 }
        ],
        progress: {
          fisherman: 3,
          decorator: 'corrupt',
          rich_farmer: -50,
          quest_master: NaN,
          valid: 7
        }
      }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.achievements.unlocked.length, 2);
  assert.equal(data.achievements.unlocked[0].id, 'first_harvest');
  assert.equal(data.achievements.unlocked[1].id, 'fisherman');
  assert.equal(data.achievements.progress['fisherman'], 3);
  assert.equal(data.achievements.progress['valid'], 7);
  assert.equal(data.achievements.progress['decorator'], undefined);
  assert.equal(data.achievements.progress['rich_farmer'], undefined);
  assert.equal(data.achievements.progress['quest_master'], undefined);
});

test('SaveSystem: achievement progress negative values clamped to 0', () => {
  const store = new InMemoryStorage();
  store.setItem(
    'sproutvalley_game_v1',
    JSON.stringify({
      meta: { version: 1, scene: 'FarmScene' },
      inventory: { activeSlot: 0, slots: new Array(24).fill(null) },
      farming: { plots: {} },
      player: { farm: null, lake: null },
      achievements: {
        unlocked: [],
        progress: {
          negative_progress: -100,
          mixed_negative: -50,
          good_progress: 5
        }
      }
    })
  );
  const sys = new SaveSystem(new SaveManager(store));
  const data = sys.loadGame();
  assert.equal(data.achievements.progress['negative_progress'], undefined);
  assert.equal(data.achievements.progress['mixed_negative'], undefined);
  assert.equal(data.achievements.progress['good_progress'], 5);
});
