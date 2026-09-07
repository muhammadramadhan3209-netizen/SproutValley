import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AchievementSystem } from '../src/systems/AchievementSystem.js';

test('AchievementSystem: registry lists known achievements', () => {
  const sys = new AchievementSystem();
  const list = sys.listAll();
  assert.ok(list.length >= 5);
  assert.ok(list.includes('first_harvest'));
  assert.ok(list.includes('fisherman'));
  assert.ok(list.includes('decorator'));
  assert.ok(list.includes('rich_farmer'));
  assert.ok(list.includes('quest_master'));
});

test('AchievementSystem: starts empty unlocked & progress', () => {
  const sys = new AchievementSystem();
  assert.equal(sys.getUnlocked().length, 0);
  assert.equal(Object.keys(sys.progress).length, 0);
  assert.equal(sys.isUnlocked('first_harvest'), false);
});

test('AchievementSystem: reportProgress with matching trigger increments progress', () => {
  const sys = new AchievementSystem();
  const unlocked = sys.reportProgress('harvest', 'carrot', 1);
  assert.equal(unlocked.length, 1);
  assert.equal(unlocked[0].id, 'first_harvest');
  assert.equal(sys.isUnlocked('first_harvest'), true);
  const record = sys.findUnlocked('first_harvest');
  assert.ok(record);
  assert.equal(record.id, 'first_harvest');
});

test('AchievementSystem: progress clamps to target when amount overshoots', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('catch_fish', 'common_brown', 25);
  const p = sys.progressFor('fisherman');
  assert.ok(p);
  assert.equal(p.progress, 10);
  assert.equal(p.target, 10);
  assert.equal(p.isComplete, true);
});

test('AchievementSystem: reportProgress with no matching trigger returns empty', () => {
  const sys = new AchievementSystem();
  const unlocked = sys.reportProgress('unknown_event', null, 1);
  assert.equal(unlocked.length, 0);
});

test('AchievementSystem: unlock returns already_unlocked on second call', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('harvest', 'carrot', 1);
  const r = sys.unlock('first_harvest');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'already_unlocked');
});

test('AchievementSystem: unlock returns unknown_achievement for invalid id', () => {
  const sys = new AchievementSystem();
  const r = sys.unlock('unknown_ach');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_achievement');
});

test('AchievementSystem: applyReward grants gold and items', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('harvest', 'carrot', 1);
  const mock = { goldReceived: 0, itemReceived: null };
  const result = sys.applyReward('first_harvest', {
    addGold: (amt) => { mock.goldReceived = amt; }
  }, {
    addItem: (id, qty) => { mock.itemReceived = { id, qty }; }
  });
  assert.equal(result.ok, true);
  assert.equal(mock.goldReceived, 50);
});

test('AchievementSystem: applyReward fails on not_unlocked', () => {
  const sys = new AchievementSystem();
  const r = sys.applyReward('fisherman', { addGold: () => {} }, { addItem: () => {} });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_unlocked');
});

test('AchievementSystem: snapshot roundtrip preserves unlocked and progress', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('harvest', 'carrot', 1);
  sys.reportProgress('catch_fish', 'common_brown', 3);
  const snap = sys.snapshot();
  assert.equal(snap.unlocked.length, 1);
  assert.equal(snap.unlocked[0].id, 'first_harvest');
  assert.equal(snap.progress['fisherman'], 3);

  const sys2 = new AchievementSystem();
  const ok = sys2.restore(snap);
  assert.equal(ok, true);
  assert.equal(sys2.isUnlocked('first_harvest'), true);
  const p = sys2.progressFor('fisherman');
  assert.equal(p.progress, 3);
});

test('AchievementSystem: restore with null keeps defaults', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('harvest', 'carrot', 1);
  const ok = sys.restore(null);
  assert.equal(ok, false);
  assert.equal(sys.isUnlocked('first_harvest'), true);
});

test('AchievementSystem: restore ignores corrupt unlocked entries', () => {
  const sys = new AchievementSystem();
  sys.restore({
    unlocked: [
      { id: 'first_harvest', unlockedAtDay: 12345 },
      null,
      'corrupt',
      { id: '' },
      { id: 'unknown_ach' },
      { id: 'decorator' }
    ],
    progress: {
      fisherman: 5,
      bad_progress: 'not number',
      negative: -10,
      fake: NaN,
      valid: 3
    }
  });
  assert.equal(sys.isUnlocked('first_harvest'), true);
  assert.equal(sys.isUnlocked('decorator'), true);
  assert.equal(sys.getUnlocked().length, 2);
  assert.equal(sys.progress['fisherman'], 5);
  assert.equal(sys.progress['valid'], 3);
  assert.equal(sys.progress['negative'], undefined);
  assert.equal(sys.progress['bad_progress'], undefined);
});

test('AchievementSystem: restore with non-object returns false', () => {
  const sys = new AchievementSystem();
  assert.equal(sys.restore(null), false);
  assert.equal(sys.restore('string'), false);
  assert.equal(sys.restore(123), false);
});

test('AchievementSystem: reset clears unlocked and progress', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('harvest', 'carrot', 1);
  sys.reportProgress('catch_fish', 'common_brown', 2);
  sys.reset();
  assert.equal(sys.getUnlocked().length, 0);
  assert.equal(Object.keys(sys.progress).length, 0);
  assert.equal(sys.isUnlocked('first_harvest'), false);
});

test('AchievementSystem: onChange listener fires on unlock', () => {
  const sys = new AchievementSystem();
  const events = [];
  sys.onChange((e, d) => events.push({ e, d }));
  sys.reportProgress('harvest', 'carrot', 1);
  assert.ok(events.some(ev => ev.e === 'unlock'));
});

test('AchievementSystem: onChange listener fires on progress before unlock', () => {
  const sys = new AchievementSystem();
  const events = [];
  sys.onChange((e, d) => events.push({ e, d }));
  sys.reportProgress('catch_fish', 'common_brown', 2);
  assert.ok(events.some(ev => ev.e === 'progress'));
  assert.equal(events.filter(ev => ev.e === 'unlock').length, 0);
});

test('AchievementSystem: unsubscribe stops listener', () => {
  const sys = new AchievementSystem();
  let count = 0;
  const off = sys.onChange(() => count++);
  sys.reportProgress('harvest', 'carrot', 1);
  assert.equal(count, 1);
  off();
  sys.reportProgress('catch_fish', 'common_brown', 5);
  assert.equal(count, 1);
});

test('AchievementSystem: progressFor unknown id returns null', () => {
  const sys = new AchievementSystem();
  assert.equal(sys.progressFor('unknown_ach'), null);
});

test('AchievementSystem: reportProgress ignores amount zero or negative', () => {
  const sys = new AchievementSystem();
  assert.equal(sys.reportProgress('harvest', 'carrot', 0).length, 0);
  assert.equal(sys.reportProgress('harvest', 'carrot', -5).length, 0);
  assert.equal(sys.isUnlocked('first_harvest'), false);
});

test('AchievementSystem: reportProgress does not re-unlock', () => {
  const sys = new AchievementSystem();
  sys.reportProgress('harvest', 'carrot', 1);
  const record = sys.findUnlocked('first_harvest');
  const firstDay = record.unlockedAtDay;
  const r2 = sys.reportProgress('harvest', 'carrot', 1);
  assert.equal(r2.length, 0);
  assert.equal(sys.getUnlocked().length, 1);
  assert.equal(sys.findUnlocked('first_harvest').unlockedAtDay, firstDay);
});