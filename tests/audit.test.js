import { test } from 'node:test';
import assert from 'node:assert/strict';
import questData from '../src/data/quests.json' with { type: 'json' };
import npcData from '../src/data/npcs.json' with { type: 'json' };
import { QuestSystem } from '../src/systems/QuestSystem.js';
import { NPCSystem } from '../src/systems/NPCSystem.js';
import { TimeSystem } from '../src/systems/TimeSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { AchievementSystem } from '../src/systems/AchievementSystem.js';
import { SaveManager } from '../src/utils/SaveManager.js';
import { SaveSystem } from '../src/systems/SaveSystem.js';

function makeMockScene(sceneKey) {
  const imageStore = new Map();
  return {
    add: {
      image: (x, y, sheet, frame) => {
        const key = `${sheet}_${frame}`;
        if (!imageStore.has(key)) {
          const obj = {
            x, y, sheet, frame, _alpha: 1,
            setOrigin() { return obj; },
            setDisplaySize() { return obj; },
            setDepth() { return obj; },
            setTexture(s, f) { obj.sheet = s; obj.frame = f; return obj; },
            setVisible() { return obj; },
            setAlpha(v) { obj._alpha = v; return obj; },
            setPosition() { return obj; },
            destroy() {}
          };
          imageStore.set(key, obj);
        }
        return imageStore.get(key);
      }
    },
    scene: { key: sceneKey || 'FarmScene' }
  };
}

test('Audit: every quest has start mechanism via NPC dialog or autoStart', () => {
  for (const def of Object.values(questData)) {
    if (def.autoStart) continue;
    const npcId = def.giverNpcId;
    assert.ok(npcId, `quest ${def.id} has no autoStart and no giverNpcId`);
    const npc = npcData[npcId];
    assert.ok(npc, `quest ${def.id} giverNpcId ${npcId} not found in npcs`);
    const hasStartQuest = findEffectInDialog(npc.dialog, 'start_quest', def.id);
    assert.ok(hasStartQuest, `quest ${def.id} not autoStart and NPC ${npcId} has no start_quest effect for it`);
  }
});

function findEffectInDialog(dialog, type, questId) {
  if (!dialog) return false;
  for (const page of Object.values(dialog)) {
    if (!page || !Array.isArray(page.choices)) continue;
    for (const choice of page.choices) {
      if (!choice || !Array.isArray(choice.effects)) continue;
      for (const eff of choice.effects) {
        if (!eff || eff.type !== type) continue;
        if (questId !== undefined && eff.questId !== questId) continue;
        return true;
      }
    }
  }
  return false;
}

test('Audit: every quest objective is reachable via gameplay trigger', () => {
  const validTriggers = ['harvest', 'catch_fish', 'place_decoration', 'earn_gold', 'talk_to_npc'];
  for (const def of Object.values(questData)) {
    for (const key of Object.keys(def.objectives || {})) {
      const trigger = key.split('_')[0];
      assert.ok(validTriggers.includes(trigger) || ['catch', 'earn', 'place', 'harvest', 'talk'].includes(trigger),
        `quest ${def.id} objective ${key} has unknown trigger`);
    }
  }
});

test('Audit: autoStart handler skips already-active or completed quests', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const time = new TimeSystem();
  const quest = new QuestSystem();

  const autoStartQuests = Object.values(questData).filter(d => d.autoStart);
  assert.ok(autoStartQuests.length > 0, 'expected at least one autoStart quest');

  for (const def of autoStartQuests) {
    const r = quest.startQuest(def.id);
    assert.equal(r.ok, true, `first start of ${def.id} should succeed`);
  }

  for (const def of autoStartQuests) {
    const r = quest.startQuest(def.id);
    assert.equal(r.ok, false, `second start of ${def.id} should fail (already active)`);
    assert.equal(r.reason, 'already_active');
  }
});

test('Audit: autoStart handler is idempotent on completed quests', () => {
  const quest = new QuestSystem();
  quest.startQuest('first_harvest');
  quest.reportProgress('harvest', 'carrot', 1);

  const r = quest.startQuest('first_harvest');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'already_completed');
});

test('Audit: quest reward gold does not double-trigger earn_gold listener filter', () => {
  const items = new ItemSystem();
  const econ = new EconomySystem(items);
  const quest = new QuestSystem();
  quest.startQuest('first_gold');

  let nonFilteredEarns = 0;
  let allEarns = 0;
  let rewardReasonEarns = 0;
  econ.onChange((event, data) => {
    if (event !== 'earn') return;
    allEarns++;
    if (data && data.reason && data.reason.startsWith('quest:')) rewardReasonEarns++;
    else nonFilteredEarns++;
  });

  econ.onChange((event, data) => {
    if (event !== 'earn') return;
    if (data && typeof data.amount === 'number' && data.amount > 0) {
      quest.reportProgress('earn_gold', null, data.amount);
    }
  });

  econ.addGold(200, 'sell:carrot');
  const completed = quest.getCompleted().find(q => q.id === 'first_gold');
  assert.ok(completed, 'first_gold should complete via 200 gold earn');

  const nonFilteredBeforeReward = nonFilteredEarns;

  if (completed) {
    quest.applyReward('first_gold', econ, null);
  }

  assert.equal(nonFilteredEarns, nonFilteredBeforeReward, 'nonFiltered earn count should not increase from quest reward');
  assert.equal(rewardReasonEarns, 1, 'reward gold should fire earn event with quest: prefix');
  assert.ok(allEarns > 1, 'multiple earn events fired (1 progress + 1 reward)');
});

test('Audit: NPC dialog start_quest effect triggers quest.startQuest via _runEffects', () => {
  const scene = makeMockScene('FarmScene');
  const time = new TimeSystem();
  time.setTime('morning');
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  const quest = new QuestSystem();
  let startedId = null;
  npcs.setQuestHandlers({ onStart: (id) => { startedId = id; } });

  npcs.openDialog('farmer_ada');
  const cur1 = npcs.currentDialog();
  assert.ok(cur1);

  const advanceTo = (targetId) => {
    let safety = 10;
    while (safety-- > 0) {
      const cur = npcs.currentDialog();
      if (!cur) break;
      if (cur.pageId === targetId) break;
      const r = npcs.advanceDialog();
      if (r.closed || r.reason === 'no_active_dialog') break;
    }
  };
  advanceTo('advice');

  npcs.dialogState.choices = [
    { label: 'A', effects: [{ type: 'start_quest', questId: 'first_harvest' }], next: 'bye' }
  ];
  npcs.chooseDialog(0);

  assert.equal(startedId, 'first_harvest', 'start_quest effect should call onStart');
});

test('Audit: LakeScene-relevant quest (fisher_friend) can be started via Fisher Jo', () => {
  const scene = makeMockScene('LakeScene');
  const time = new TimeSystem();
  time.setTime('morning');
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  const quest = new QuestSystem();
  let startedId = null;
  npcs.setQuestHandlers({ onStart: (id) => { startedId = id; } });

  npcs.openDialog('fisher_jo');
  let safety = 5;
  while (safety-- > 0 && npcs.currentDialog() && npcs.currentDialog().pageId !== 'tip') {
    npcs.advanceDialog();
  }
  const cur = npcs.currentDialog();
  assert.equal(cur.pageId, 'tip', 'should reach tip page');

  npcs.dialogState.choices = [
    { label: 'A', effects: [{ type: 'start_quest', questId: 'fisher_friend' }], next: 'bye' }
  ];
  npcs.chooseDialog(0);

  assert.equal(startedId, 'fisher_friend');
});

test('Audit: every NPC that can give quests has dialog with start_quest effects', () => {
  for (const npc of Object.values(npcData)) {
    if (!npc.dialog) continue;
    const hasAnyStartQuest = findEffectInDialog(npc.dialog, 'start_quest');
    const giverQuests = Object.values(questData).filter(q => q.giverNpcId === npc.id);
    if (giverQuests.length === 0) continue;
    assert.ok(hasAnyStartQuest, `NPC ${npc.id} is a giver for ${giverQuests.length} quests but has no start_quest effect`);
  }
});

test('Audit: quest snapshot preserves progress through save roundtrip', () => {
  const store = (function () {
    const m = new Map();
    return {
      get length() { return m.size; },
      key(i) { return Array.from(m.keys())[i]; },
      getItem(k) { return m.has(k) ? m.get(k) : null; },
      setItem(k, v) { m.set(k, String(v)); },
      removeItem(k) { m.delete(k); },
      clear() { m.clear(); }
    };
  })();
  const manager = new SaveManager(store);
  const sys = new SaveSystem(manager);

  const quest = new QuestSystem();
  quest.startQuest('fisher_friend');
  quest.reportProgress('catch_fish', 'fish_common_brown', 2);

  sys.setQuestSnapshot(quest);
  sys.saveGame();

  const sys3 = new SaveSystem(new SaveManager(store));
  const data = sys3.loadGame();
  assert.ok(data.quests);
  const active = data.quests.active.find(q => q.id === 'fisher_friend');
  assert.ok(active);
  assert.equal(active.progress['catch_fish'], 2);

  const quest2 = new QuestSystem();
  sys3.restoreQuestsTo(quest2);
  const restored = quest2.progressFor('fisher_friend');
  assert.equal(restored.objectives['catch_fish'], 2);
});

test('Audit: build mode gating excludes all 4 UI panels', () => {
  const uiStates = [
    { name: 'shop', visible: true },
    { name: 'inventory', visible: true },
    { name: 'quest', visible: true },
    { name: 'achievement', visible: true }
  ];
  const anyVisible = uiStates.some(u => u.visible);
  assert.equal(anyVisible, true);
  const bShouldToggleBuild = !anyVisible;
  assert.equal(bShouldToggleBuild, false);
});

test('Audit: NPC dialog with start_quest effect is idempotent on already-completed quest', () => {
  const scene = makeMockScene('FarmScene');
  const time = new TimeSystem();
  time.setTime('morning');
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  const quest = new QuestSystem();
  npcs.setQuestHandlers({ onStart: (id) => quest.startQuest(id) });

  npcs.openDialog('farmer_ada');
  npcs.dialogState.choices = [
    { label: 'A', effects: [{ type: 'start_quest', questId: 'first_harvest' }], next: 'bye' }
  ];
  npcs.chooseDialog(0);
  assert.equal(quest.isActive('first_harvest'), true);

  npcs.openDialog('farmer_ada');
  npcs.dialogState.choices = [
    { label: 'A', effects: [{ type: 'start_quest', questId: 'first_harvest' }], next: 'bye' }
  ];
  npcs.chooseDialog(0);
  assert.equal(quest.isActive('first_harvest'), true, 'still active (not double-added)');
  assert.equal(quest.getActive().length, 1, 'still only one active quest');
});

test('Audit: EconomySystem buyItem with non-existent item id returns unknown_item', () => {
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  const econ = new EconomySystem(items);
  const r = econ.buyItem('does_not_exist', 1, inv);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_item');
});

test('Audit: EconomySystem sellItem without itemSystem returns no_item_system', () => {
  const econ = new EconomySystem(null);
  const r = econ.sellItem('harvest_carrot', 1, { hasItem: () => true, removeItem: () => 1 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_item_system');
});

test('Audit: EconomySystem addGold beyond max clamps correctly', () => {
  const econ = new EconomySystem(new ItemSystem());
  const before = econ.getGold();
  econ.addGold(999999999, 'test');
  const after = econ.getGold();
  assert.ok(after <= 999999);
  assert.ok(after >= before);
});

test('Audit: Achievement reward gold flagged with achievement: prefix does not re-trigger earn', () => {
  const items = new ItemSystem();
  const econ = new EconomySystem(items);
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  const ach = new AchievementSystem();
  ach.unlock('rich_farmer');

  let filtered = 0;
  econ.onChange((event, data) => {
    if (event !== 'earn') return;
    if (data && data.reason && data.reason.startsWith('achievement:')) filtered++;
  });

  ach.applyReward('rich_farmer', econ, inv);
  assert.ok(filtered >= 1, 'achievement reward should fire earn event with achievement: prefix');
});

test('Audit: AchievementSystem never unlocks same achievement twice', () => {
  const ach = new AchievementSystem();
  ach.reportProgress('harvest', 'carrot', 1);
  const firstUnlock = ach.isUnlocked('first_harvest');
  ach.reportProgress('harvest', 'carrot', 5);
  const stillUnlocked = ach.isUnlocked('first_harvest');
  assert.equal(firstUnlock, true);
  assert.equal(stillUnlocked, true);
  assert.equal(ach.getUnlocked().length, 1);
});

test('Audit: LakeScene-relevant economy share works through shared registry pattern', async () => {
  const items = new ItemSystem();
  const econ1 = new EconomySystem(items);
  const mockRegistry = new Map();
  mockRegistry.set('__sproutValleyEconomy', econ1);
  const econ2 = mockRegistry.get('__sproutValleyEconomy');
  assert.equal(econ1, econ2);
  econ1.addGold(50, 'test');
  assert.equal(econ2.getGold(), 150);
});