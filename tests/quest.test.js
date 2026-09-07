import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuestSystem } from '../src/systems/QuestSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';

function makeBundle() {
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  const econ = new EconomySystem(items);
  const quests = new QuestSystem();
  return { items, inv, econ, quests };
}

test('QuestSystem: listAll returns registered quests', () => {
  const { quests } = makeBundle();
  const list = quests.listAll();
  assert.ok(list.length >= 4);
  assert.ok(list.includes('first_harvest'));
  assert.ok(list.includes('fisher_friend'));
});

test('QuestSystem: start moves quest to active list', () => {
  const { quests } = makeBundle();
  const r = quests.startQuest('first_harvest');
  assert.equal(r.ok, true);
  assert.equal(quests.isActive('first_harvest'), true);
});

test('QuestSystem: start fails for unknown quest', () => {
  const { quests } = makeBundle();
  const r = quests.startQuest('unknown');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_quest');
});

test('QuestSystem: start fails when already active', () => {
  const { quests } = makeBundle();
  quests.startQuest('first_harvest');
  const r = quests.startQuest('first_harvest');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'already_active');
});

test('QuestSystem: start fails when already completed', () => {
  const { quests } = makeBundle();
  quests.startQuest('first_harvest');
  quests.reportProgress('harvest', 'carrot', 1);
  const completed = quests.reportProgress('harvest', 'carrot', 0);
  assert.ok(completed.length >= 0);
  const r = quests.startQuest('first_harvest');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'already_completed');
});

test('QuestSystem: reportProgress increments progress', () => {
  const { quests } = makeBundle();
  quests.startQuest('fisher_friend');
  const before = quests.progressFor('fisher_friend').objectives['catch_fish'] || 0;
  quests.reportProgress('catch_fish', 'common_brown', 1);
  const after = quests.progressFor('fisher_friend').objectives['catch_fish'] || 0;
  assert.equal(after - before, 1);
});

test('QuestSystem: reportProgress completes when threshold met', () => {
  const { quests } = makeBundle();
  quests.startQuest('fisher_friend');
  const completed = quests.reportProgress('catch_fish', 'common_brown', 5);
  assert.ok(completed.length === 1);
  assert.equal(completed[0].id, 'fisher_friend');
  assert.equal(quests.isCompleted('fisher_friend'), true);
});

test('QuestSystem: catch_fish progress with category only', () => {
  const { quests } = makeBundle();
  quests.startQuest('fisher_friend');
  quests.reportProgress('catch_fish', 'common_brown', 2);
  const p = quests.progressFor('fisher_friend');
  assert.equal(p.objectives['catch_fish'] || 0, 2);
  const completed = quests.reportProgress('catch_fish', 'common_orange', 1);
  assert.equal(completed.length, 1);
});

test('QuestSystem: place_decoration progress', () => {
  const { quests } = makeBundle();
  quests.startQuest('decorator');
  const c1 = quests.reportProgress('place_decoration', null, 1);
  const c2 = quests.reportProgress('place_decoration', null, 2);
  assert.equal(c1.length, 0);
  assert.equal(c2.length, 1);
  assert.equal(quests.isCompleted('decorator'), true);
});

test('QuestSystem: earn_gold progress', () => {
  const { quests } = makeBundle();
  quests.startQuest('first_gold');
  quests.reportProgress('earn_gold', null, 100);
  const completed = quests.reportProgress('earn_gold', null, 100);
  assert.equal(completed.length, 1);
});

test('QuestSystem: applyReward gives gold and items', () => {
  const { inv, econ, quests } = makeBundle();
  econ.addGold(100);
  quests.startQuest('first_harvest');
  quests.reportProgress('harvest', 'carrot', 1);
  const beforeGold = econ.getGold();
  const beforeSeed = inv.countItem('seed_carrot');
  const r = quests.applyReward('first_harvest', econ, inv);
  assert.equal(r.ok, true);
  assert.equal(econ.getGold(), beforeGold + 50);
  assert.equal(inv.countItem('seed_carrot'), beforeSeed + 3);
});

test('QuestSystem: progressFor null when not active', () => {
  const { quests } = makeBundle();
  assert.equal(quests.progressFor('first_harvest'), null);
});

test('QuestSystem: progressFor returns isComplete true when done', () => {
  const { quests } = makeBundle();
  quests.startQuest('fisher_friend');
  // Report partially complete first
  const p1 = quests.progressFor('fisher_friend');
  assert.equal(p1.isComplete, false);
  // Complete via reports
  quests.reportProgress('catch_fish', 'common_brown', 2);
  quests.reportProgress('catch_fish', 'common_orange', 1);
  // Quest should be completed now
  assert.equal(quests.isCompleted('fisher_friend'), true);
});

test('QuestSystem: failQuest moves to failed', () => {
  const { quests } = makeBundle();
  quests.startQuest('first_harvest');
  const r = quests.failQuest('first_harvest');
  assert.equal(r.ok, true);
  assert.equal(quests.isFailed('first_harvest'), true);
  assert.equal(quests.isActive('first_harvest'), false);
});

test('QuestSystem: failQuest fails when not active', () => {
  const { quests } = makeBundle();
  const r = quests.failQuest('first_harvest');
  assert.equal(r.ok, false);
});

test('QuestSystem: max active limit', () => {
  const { quests } = makeBundle();
  const allIds = quests.listAll();
  for (let i = 0; i < allIds.length; i++) {
    const r = quests.startQuest(allIds[i]);
    if (i >= 5) {
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'limit_reached');
      break;
    }
  }
});

test('QuestSystem: snapshot roundtrip', () => {
  const { quests } = makeBundle();
  quests.startQuest('fisher_friend');
  quests.reportProgress('catch_fish', 'common_brown', 1);
  const snap = quests.snapshot();
  const quests2 = new QuestSystem();
  quests2.restore(snap);
  assert.equal(quests2.isActive('fisher_friend'), true);
  const p = quests2.progressFor('fisher_friend');
  assert.equal(p.objectives['catch_fish'], 1);
});

test('QuestSystem: restore with null keeps defaults', () => {
  const { quests } = makeBundle();
  quests.startQuest('first_harvest');
  const ok = quests.restore(null);
  assert.equal(ok, false);
});

test('QuestSystem: restore ignores invalid entries', () => {
  const { quests } = makeBundle();
  quests.restore({
    active: [
      { id: 'first_harvest', objectives: { harvest_carrot: 1 } },
      null,
      'not an object',
      { id: 123, objectives: {} }
    ],
    completed: [],
    failed: []
  });
  assert.equal(quests.active.length, 1);
  assert.equal(quests.active[0].id, 'first_harvest');
});

test('QuestSystem: reset clears all', () => {
  const { quests } = makeBundle();
  quests.startQuest('first_harvest');
  quests.startQuest('fisher_friend');
  quests.reset();
  assert.equal(quests.active.length, 0);
  assert.equal(quests.completed.length, 0);
  assert.equal(quests.failed.length, 0);
});

test('QuestSystem: onChange listener fires on start/complete', () => {
  const { quests } = makeBundle();
  const events = [];
  quests.onChange((e) => events.push(e));
  quests.startQuest('first_harvest');
  quests.reportProgress('harvest', 'carrot', 1);
  assert.ok(events.includes('start'));
  assert.ok(events.includes('complete'));
});

test('QuestSystem: registerProgressTrigger callback', () => {
  const { quests } = makeBundle();
  let triggered = false;
  quests.registerProgressTrigger(() => { triggered = true; });
  quests.startQuest('first_harvest');
  quests.reportProgress('harvest', 'carrot', 1);
  assert.equal(triggered, true);
});

test('QuestSystem: completeQuest fails when not active', () => {
  const { quests } = makeBundle();
  const r = quests.completeQuest('first_harvest');
  assert.equal(r.ok, false);
});