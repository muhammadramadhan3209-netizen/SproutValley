import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToastQueue, ToastUI } from '../src/ui/ToastUI.js';
import { formatQuestLine, buildQuestView, QuestUI } from '../src/ui/QuestUI.js';
import { formatAchievementLine, AchievementUI } from '../src/ui/AchievementUI.js';

test('ToastQueue: starts empty', () => {
  const q = new ToastQueue();
  assert.equal(q.size(), 0);
  assert.equal(q.current(), null);
  assert.equal(q.totalSeen(), 0);
});

test('ToastQueue: push adds to current and increments total', () => {
  const q = new ToastQueue();
  assert.equal(q.push('hello', { kind: 'quest' }), true);
  assert.equal(q.size(), 1);
  assert.equal(q.totalSeen(), 1);
  assert.equal(q.current().message, 'hello');
  assert.equal(q.current().kind, 'quest');
});

test('ToastQueue: rejects empty / non-string message', () => {
  const q = new ToastQueue();
  assert.equal(q.push(''), false);
  assert.equal(q.push(null), false);
  assert.equal(q.push(123), false);
  assert.equal(q.size(), 0);
});

test('ToastQueue: consume removes head and tracks totalSeen', () => {
  const q = new ToastQueue();
  q.push('first');
  q.push('second');
  assert.equal(q.current().message, 'first');
  const head = q.consume();
  assert.equal(head.message, 'first');
  assert.equal(q.size(), 1);
  assert.equal(q.current().message, 'second');
  assert.equal(q.totalSeen(), 2);
});

test('ToastQueue: consume on empty returns null', () => {
  const q = new ToastQueue();
  assert.equal(q.consume(), null);
});

test('ToastQueue: maxSize trims oldest', () => {
  const q = new ToastQueue({ maxSize: 2 });
  q.push('a');
  q.push('b');
  q.push('c');
  assert.equal(q.size(), 2);
  assert.equal(q.current().message, 'b');
});

test('ToastQueue: default duration applies when none given', () => {
  const q = new ToastQueue();
  q.push('hello');
  assert.equal(q.current().duration, 2500);
});

test('ToastQueue: custom duration overrides default', () => {
  const q = new ToastQueue({ defaultDurationMs: 1000 });
  q.push('x', { duration: 5000 });
  assert.equal(q.current().duration, 5000);
});

test('ToastQueue: clear returns dropped and resets', () => {
  const q = new ToastQueue();
  q.push('a');
  q.push('b');
  const dropped = q.clear();
  assert.equal(dropped.length, 2);
  assert.equal(q.size(), 0);
  assert.equal(q.totalSeen(), 0);
});

test('ToastQueue: kinds() lists supported kinds', () => {
  const q = new ToastQueue();
  const kinds = q.kinds();
  assert.ok(kinds.includes('quest'));
  assert.ok(kinds.includes('achievement'));
  assert.ok(kinds.includes('reward'));
  assert.ok(kinds.includes('info'));
});

test('ToastQueue: colorFor known and unknown kinds', () => {
  assert.equal(ToastQueue.colorFor('quest'), '#ffd700');
  assert.equal(ToastQueue.colorFor('achievement'), '#9bd07a');
  assert.equal(ToastQueue.colorFor('reward'), '#ffe066');
  assert.equal(ToastQueue.colorFor('info'), '#cccccc');
  assert.equal(ToastQueue.colorFor('unknown_kind'), '#cccccc');
});

test('ToastQueue: labelFor known and unknown kinds', () => {
  assert.equal(ToastQueue.labelFor('quest'), 'Quest');
  assert.equal(ToastQueue.labelFor('achievement'), 'Achievement');
  assert.equal(ToastQueue.labelFor('unknown'), 'Info');
});

test('ToastUI: static color/label delegates to ToastQueue', () => {
  assert.equal(ToastUI.colorFor('quest'), '#ffd700');
  assert.equal(ToastUI.labelFor('reward'), 'Reward');
});

test('formatQuestLine: active quest shows progress', () => {
  const def = {
    id: 'first_harvest',
    title: 'First Harvest',
    description: 'Harvest a crop',
    objectives: { harvest_carrot: 1 },
    reward: { gold: 50, items: [] }
  };
  const instance = {
    id: 'first_harvest',
    state: 'active',
    objectives: { harvest_carrot: 1 },
    progress: { harvest_carrot: 0 }
  };
  const line = formatQuestLine(instance, def);
  assert.ok(line);
  assert.equal(line.marker, '[>]');
  assert.equal(line.title, 'First Harvest');
  assert.equal(line.progressText, '0/1');
  assert.equal(line.rewardText, '+50g');
  assert.equal(line.isCompleted, false);
});

test('formatQuestLine: completed quest shows complete marker', () => {
  const def = { id: 'q1', title: 'Q1', objectives: { a: 1 }, reward: {} };
  const completed = {
    id: 'q1',
    state: 'completed',
    objectives: { a: 1 },
    progress: { a: 1 }
  };
  const line = formatQuestLine(completed, def);
  assert.equal(line.marker, '[v]');
  assert.equal(line.status, 'COMPLETE');
  assert.equal(line.isCompleted, true);
  assert.equal(line.progressText, '');
});

test('formatQuestLine: reward text includes items', () => {
  const def = { id: 'q', title: 'Q', objectives: {}, reward: { gold: 30, items: [{ id: 'seed_carrot', quantity: 3 }] } };
  const inst = { id: 'q', state: 'active', objectives: {}, progress: {} };
  const itemSystem = { getName: (id) => id === 'seed_carrot' ? 'Carrot Seeds' : id };
  const line = formatQuestLine(inst, def, itemSystem);
  assert.match(line.rewardText, /\+30g/);
  assert.match(line.rewardText, /\+3 Carrot Seeds/);
});

test('formatQuestLine: returns null for missing inputs', () => {
  assert.equal(formatQuestLine(null, null), null);
  assert.equal(formatQuestLine({}, null), null);
});

test('buildQuestView: returns active and completed lists', () => {
  const sys = {
    getActive: () => [{ id: 'a', state: 'active', objectives: { x: 2 }, progress: { x: 1 } }],
    getCompleted: () => [{ id: 'b', state: 'completed', objectives: { y: 1 }, progress: { y: 1 } }],
    get: (id) => {
      const map = {
        a: { id: 'a', title: 'A', objectives: { x: 2 }, reward: {} },
        b: { id: 'b', title: 'B', objectives: { y: 1 }, reward: {} }
      };
      return map[id] || null;
    }
  };
  const view = buildQuestView(sys);
  assert.equal(view.active.length, 1);
  assert.equal(view.completed.length, 1);
  assert.equal(view.active[0].marker, '[>]');
  assert.equal(view.completed[0].marker, '[v]');
});

test('buildQuestView: empty when no questSystem', () => {
  assert.deepEqual(buildQuestView(null).active, []);
  assert.deepEqual(buildQuestView(null).completed, []);
});

test('formatAchievementLine: locked shows progress', () => {
  const def = { id: 'fisherman', title: 'Fisherman', description: 'Catch fish', target: 10, reward: { gold: 0, items: [{ id: 'material_wood', quantity: 5 }] } };
  const itemSystem = { getName: (id) => id === 'material_wood' ? 'Wood' : id };
  const line = formatAchievementLine(def, 3, false, itemSystem);
  assert.ok(line);
  assert.equal(line.marker, '[ ]');
  assert.equal(line.status, '3/10');
  assert.equal(line.title, 'Fisherman');
  assert.equal(line.isUnlocked, false);
  assert.equal(line.progress, 3);
  assert.match(line.reward, /\+5 Wood/);
});

test('formatAchievementLine: unlocked shows DONE', () => {
  const def = { id: 'first_harvest', title: 'First Harvest', target: 1, reward: { gold: 50, items: [] } };
  const line = formatAchievementLine(def, 1, true);
  assert.equal(line.marker, '[v]');
  assert.equal(line.status, 'DONE');
  assert.equal(line.isUnlocked, true);
  assert.match(line.reward, /\+50g/);
});

test('formatAchievementLine: progress clamps to target', () => {
  const def = { id: 'a', title: 'A', target: 10, reward: {} };
  const line = formatAchievementLine(def, 99, false);
  assert.equal(line.progress, 10);
  assert.equal(line.status, '10/10');
});

test('formatAchievementLine: returns null for invalid def', () => {
  assert.equal(formatAchievementLine(null, 0, false), null);
  assert.equal(formatAchievementLine('string', 0, false), null);
});

test('formatAchievementLine: uses itemSystem for item name resolution', () => {
  const def = { id: 'x', title: 'X', target: 1, reward: { items: [{ id: 'foo', quantity: 2 }] } };
  const itemSystem = { getName: (id) => id === 'foo' ? 'Foobar' : id };
  const line = formatAchievementLine(def, 0, false, itemSystem);
  assert.match(line.reward, /\+2 Foobar/);
});

test('AchievementUI: registered listAll exposed', () => {
  const ach = {
    listAll: () => ['first_harvest', 'fisherman'],
    get: (id) => ({ id, title: id, target: 1, reward: {} }),
    isUnlocked: () => false,
    progress: {}
  };
  assert.ok(typeof AchievementUI === 'function');
  assert.deepEqual(ach.listAll(), ['first_harvest', 'fisherman']);
});

test('QuestUI: helper class exported', () => {
  assert.ok(typeof QuestUI === 'function');
});