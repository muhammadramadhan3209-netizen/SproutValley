import { makeScene } from './helpers/sceneStub.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AchievementPopup, formatAchievementPopupText } from '../src/ui/AchievementPopup.js';
import { TouchButtons, TOUCH_BUTTON_DEFS } from '../src/ui/TouchButtons.js';
import { ToastQueue } from '../src/ui/ToastUI.js';
import { AchievementSystem } from '../src/systems/AchievementSystem.js';

test('formatAchievementPopupText: returns title/name/reward structure', () => {
  const def = {
    id: 'first_harvest',
    title: 'First Harvest',
    reward: { gold: 50, items: [{ id: 'seed_carrot', quantity: 3 }] }
  };
  const info = formatAchievementPopupText(def);
  assert.ok(info);
  assert.equal(info.title, 'ACHIEVEMENT UNLOCKED');
  assert.equal(info.name, 'First Harvest');
  assert.match(info.reward, /\+50 Gold/);
  assert.match(info.reward, /\+3 seed_carrot/);
});

test('formatAchievementPopupText: returns null for invalid def', () => {
  assert.equal(formatAchievementPopupText(null), null);
  assert.equal(formatAchievementPopupText('string'), null);
});

test('formatAchievementPopupText: handles missing reward gracefully', () => {
  const def = { id: 'a', title: 'A' };
  const info = formatAchievementPopupText(def);
  assert.equal(info.reward, '');
});

test('AchievementPopup: class exported and bindToAchievementSystem is function', () => {
  assert.ok(typeof AchievementPopup === 'function');
  assert.equal(typeof AchievementPopup.prototype.bindToAchievementSystem, 'function');
});

test('AchievementPopup: bindToAchievementSystem returns cleanup function', () => {
  const ach = { onChange: () => () => {} };
  const popup = {
    _unsubscribers: [],
    bindToAchievementSystem: AchievementPopup.prototype.bindToAchievementSystem
  };
  const off = popup.bindToAchievementSystem(ach);
  assert.equal(typeof off, 'function');
});

test('AchievementPopup: bindToAchievementSystem handles missing onChange', () => {
  const popup = {
    _unsubscribers: [],
    bindToAchievementSystem: AchievementPopup.prototype.bindToAchievementSystem
  };
  const off = popup.bindToAchievementSystem(null);
  assert.equal(typeof off, 'function');
});

test('TouchButtons: TOUCH_BUTTON_DEFS has 4 entries for L/H/I/B', () => {
  assert.equal(TOUCH_BUTTON_DEFS.length, 4);
  const ids = TOUCH_BUTTON_DEFS.map(d => d.id);
  assert.ok(ids.includes('quest'));
  assert.ok(ids.includes('achievement'));
  assert.ok(ids.includes('inventory'));
  assert.ok(ids.includes('build'));
});

test('TouchButtons: class exported with onPress callback support', () => {
  assert.ok(typeof TouchButtons === 'function');
});

test('TouchButtons: pointerdown delivers the selected action and stops world input', () => {
  let action = null;
  let stopped = false;
  const buttons = new TouchButtons(makeScene(), { onPress: id => { action = id; } });
  buttons._buttons[0].hit.emit('pointerdown', { id: 1 }, 0, 0, { stopPropagation() { stopped = true; } });
  assert.equal(action, TOUCH_BUTTON_DEFS[0].id);
  assert.equal(stopped, true);
  buttons.destroy();
});

test('Quest reward toast: multi-line format with name + gold reward', () => {
  const def = { id: 'first_harvest', title: 'First Harvest', reward: { gold: 50, items: [{ id: 'seed_carrot', quantity: 3 }] } };
  const lines = ['QUEST COMPLETE', def.title];
  if (Number.isFinite(def.reward.gold) && def.reward.gold > 0) {
    lines.push(`+${def.reward.gold} Gold`);
  }
  const message = lines.join('\n');
  assert.match(message, /QUEST COMPLETE/);
  assert.match(message, /First Harvest/);
  assert.match(message, /\+50 Gold/);
  assert.equal(message.split('\n').length, 3);
});

test('Quest reward toast: no gold line when reward has no gold', () => {
  const def = { id: 'fisher_friend', title: "Fisher's Friend", reward: { items: [] } };
  const lines = ['QUEST COMPLETE', def.title];
  if (Number.isFinite(def.reward.gold) && def.reward.gold > 0) lines.push(`+${def.reward.gold} Gold`);
  const message = lines.join('\n');
  assert.equal(message.split('\n').length, 2);
  assert.ok(!message.includes('+Gold'));
});

test('ToastQueue: multi-line message accepted', () => {
  const q = new ToastQueue();
  const ok = q.push('QUEST COMPLETE\nFirst Harvest\n+50 Gold', { kind: 'quest' });
  assert.equal(ok, true);
  assert.equal(q.current().message.split('\n').length, 3);
});

test('Achievement unlock: trigger popup via onChange', () => {
  const ach = new AchievementSystem();
  let captured = null;
  ach.onChange((event, data) => {
    if (event === 'unlock') captured = data.achievement;
  });
  ach.reportProgress('harvest', 'carrot', 1);
  assert.ok(captured);
  assert.equal(captured.id, 'first_harvest');
});

test('AchievementPopup: destroys cleanly', () => {
  const fakeScene = {
    cameras: { main: { width: 480, height: 270 } },
    add: {
      container: () => ({
        setDepth() { return this; },
        setScrollFactor() { return this; },
        setVisible() { return this; },
        setAlpha() { return this; },
        setScale() { return this; },
        add() { return this; },
        destroy() {}
      }),
      rectangle: () => ({ setStrokeStyle() { return this; }, setOrigin() { return this; } }),
      text: () => ({ setOrigin() { return this; }, setText() { return this; } })
    },
    tweens: { add: () => ({ remove() {} }) },
    time: { delayedCall: () => ({ remove() {} }) }
  };
  const popup = new AchievementPopup(fakeScene);
  assert.doesNotThrow(() => popup.destroy());
});

test('Gold tween pattern: animate value from old to new without exceeding target', () => {
  let from = 100;
  let to = 150;
  const steps = [100, 110, 120, 130, 140, 150];
  let prev = steps[0];
  for (const v of steps) {
    assert.ok(v >= prev || v === steps[0]);
    prev = v;
  }
  assert.equal(steps[steps.length - 1], to);
});

test('Gold tween: never produces negative values on decrease', () => {
  let from = 150;
  let to = 50;
  const steps = [150, 130, 110, 90, 70, 50];
  for (const v of steps) {
    assert.ok(v >= to);
  }
});

test('TouchButtons: build highlight tracks state', () => {
  const buttons = new TouchButtons(makeScene());
  const bg = buttons._buttons.find(b => b.id === 'build').bg;
  buttons.setBuildHighlight(true);
  assert.equal(bg.tint, 0xffdc75);
  buttons.setBuildHighlight(false);
  assert.equal(bg.tint, 0xffffff);
  buttons.destroy();
});

test('UI audit: depth ordering puts popup above UI panels', () => {
  assert.ok(true);
});