import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeScene } from './helpers/sceneStub.js';
import { VirtualPad } from '../src/ui/VirtualPad.js';
import { TouchButtons, TOUCH_BUTTON_DEFS } from '../src/ui/TouchButtons.js';
import { ActionButtons, FARM_ACTION_DEFS, LAKE_ACTION_DEFS } from '../src/ui/ActionButtons.js';
import { TOUCH_SIZE, PAD_RADIUS, landscapeSize } from '../src/config/mobileLayout.js';
import { movementVelocity, normalizeDirection } from '../src/utils/playerMovement.js';

function pressPad(pad, x, y, id = 1) {
  const pointer = { id, isDown: true, x: pad._container.x + x, y: pad._container.y + y };
  pad.base.emit('pointerdown', pointer, 0, 0, { stopPropagation() {} });
  return pointer;
}

test('VirtualPad: drag emits axes that actually produce movement velocity', () => {
  const scene = makeScene();
  let velocity;
  const pad = new VirtualPad(scene, { onChange: touch => { velocity = movementVelocity({}, touch, 80); } });
  const pointer = pressPad(pad, 28, 0);
  assert.deepEqual(velocity, { x: 80, y: 0 });
  pointer.x = pad._container.x - 40;
  pointer.y = pad._container.y - 40;
  scene.input.emit('pointermove', pointer);
  assert.ok(velocity.x < 0 && velocity.y < 0);
  assert.ok(Math.abs(Math.hypot(velocity.x, velocity.y) - 80) < 1e-9);
  scene.input.emit('pointerup', pointer);
  assert.deepEqual(velocity, { x: 0, y: 0 });
  pad.destroy();
});

test('VirtualPad: second finger cannot steal the joystick or release it', () => {
  const scene = makeScene();
  const pad = new VirtualPad(scene);
  const first = pressPad(pad, 28, 0, 1);
  pressPad(pad, -28, 0, 2);
  scene.input.emit('pointerup', { id: 2 });
  assert.equal(pad.getDirection().x, 1);
  scene.input.emit('pointerupoutside', first);
  assert.equal(pad.isActive(), false);
  pad.destroy();
});

test('VirtualPad: dead zone, hide, blur, pause and cancellation release input', () => {
  const scene = makeScene();
  const pad = new VirtualPad(scene);
  pressPad(pad, 2, 2);
  assert.equal(pad.isActive(), false);
  pad.reset();
  for (const reset of [() => pad.setVisible(false), () => scene.game.events.emit('blur'),
    () => scene.events.emit('pause'), () => scene.game.canvas.dispatchEvent(new Event('touchcancel')),
    () => pad.setEnabled(false)]) {
    pad.setVisible(true); pad.setEnabled(true);
    pressPad(pad, 28, 0);
    assert.equal(pad.isActive(), true);
    reset();
    assert.equal(pad.isActive(), false);
  }
  pad.destroy();
  assert.equal(scene.input.listenerCount('pointermove'), 0);
  assert.equal(scene.game.events.listenerCount('blur'), 0);
  assert.equal(scene.scale.listenerCount('resize'), 0);
});

test('Movement: keyboard, legacy digital input, axes and diagonal speed', () => {
  assert.deepEqual(movementVelocity({ left: true }, {}, 80), { x: -80, y: 0 });
  assert.deepEqual(movementVelocity({}, { down: true }, 80), { x: 0, y: 80 });
  assert.deepEqual(movementVelocity({ up: true }, { x: 1 }, 80), { x: 0, y: -80 });
  assert.deepEqual(movementVelocity({ right: true }, { x: 1 }, 80, false), { x: 0, y: 0 });
  assert.deepEqual(normalizeDirection(null), { x: 0, y: 0 });
  assert.deepEqual(normalizeDirection({ x: NaN, y: Infinity }), { x: 0, y: 0 });
  assert.deepEqual(movementVelocity({ left: true, right: true }, {}, 80), { x: 0, y: 0 });
  const diagonal = movementVelocity({ down: true, right: true }, {}, 80);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 80) < 1e-9);
});

test('TouchButtons: blocked/hidden actions do not run and resize changes position', () => {
  const scene = makeScene();
  let count = 0;
  const buttons = new ActionButtons(scene, { onPress: () => count++ });
  const button = buttons._buttons[0];
  button.hit.emit('pointerdown', {}, 0, 0);
  buttons.setEnabled(false);
  button.hit.emit('pointerdown', {}, 0, 0);
  buttons.setEnabled(true); buttons.setVisible(false);
  button.hit.emit('pointerdown', {}, 0, 0);
  assert.equal(count, 1);
  const previousX = button.container.x;
  scene.scale.width = 360;
  scene.scale.emit('resize');
  assert.equal(button.container.x, previousX - 120);
  assert.equal(button.hit.scrollFactorX, 0);
  assert.equal(button.hit.scrollFactorY, 0);
  buttons.destroy();
  assert.equal(scene.scale.listenerCount('resize'), 0);
});

test('Landscape layouts: actual joystick/buttons fit and do not overlap', () => {
  for (const viewport of [[960, 540], [800, 360], [1024, 768], [2400, 1000]]) {
    const size = landscapeSize(...viewport);
    const scene = makeScene(size.width, size.height);
    const pad = new VirtualPad(scene);
    const menu = new TouchButtons(scene, { top: true });
    const actions = new ActionButtons(scene);
    const all = [...menu._buttons, ...actions._buttons];
    const boxes = all.map(b => ({ x: b.container.x - TOUCH_SIZE / 2, y: b.container.y - TOUCH_SIZE / 2, w: TOUCH_SIZE, h: TOUCH_SIZE }));
    boxes.push({ x: pad._container.x - PAD_RADIUS, y: pad._container.y - PAD_RADIUS, w: PAD_RADIUS * 2, h: PAD_RADIUS * 2 });
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= size.width && a.y + a.h <= size.height);
      for (const b of boxes.slice(i + 1)) {
        assert.equal(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y, false);
      }
    }
    assert.ok(TOUCH_SIZE * Math.min(viewport[0] / size.width, viewport[1] / size.height) >= 44);
    pad.destroy(); menu.destroy(); actions.destroy();
  }
});

test('Existing action coverage remains available for Farm and Lake', () => {
  const ids = new Set([...TOUCH_BUTTON_DEFS, ...FARM_ACTION_DEFS].map(d => d.id));
  for (const id of ['quest', 'achievement', 'inventory', 'build', 'hoe', 'water', 'harvest', 'interact', 'shop', 'seed_cycle', 'build_cycle']) assert.ok(ids.has(id));
  assert.deepEqual(LAKE_ACTION_DEFS.map(d => d.id), ['cast', 'catch', 'interact']);
});
