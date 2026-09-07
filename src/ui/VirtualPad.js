import { PAD_RADIUS, padPosition } from '../config/mobileLayout.js';
import { normalizeDirection } from '../utils/playerMovement.js';

export class VirtualPad {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.onChange = options.onChange || (() => {});
    this.visible = true;
    this.enabled = true;
    this._pointerId = null;
    this._direction = { x: 0, y: 0 };
    this._dir = {};
    this._container = scene.add.container(0, 0).setDepth(180).setScrollFactor(0);
    this.base = scene.add.circle(0, 0, PAD_RADIUS, 0x342e22, 0.5)
      .setStrokeStyle(2, 0xe8d0a4, 0.85).setScrollFactor(0).setInteractive();
    this.knob = scene.add.circle(0, 0, 15, 0xe8d0a4, 0.9).setStrokeStyle(2, 0x927953);
    this._container.add([this.base, this.knob]);
    this.base.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation();
      if (!this.enabled || this._pointerId !== null) return;
      this._pointerId = pointer.id;
      this._move(pointer);
    });
    this._moveHandler = pointer => {
      if (pointer.id === this._pointerId) this._move(pointer);
    };
    this._upHandler = pointer => {
      if (pointer.id === this._pointerId) this.reset();
    };
    this._resetHandler = () => this.reset();
    this._layoutHandler = () => this.layout();
    scene.input.on('pointermove', this._moveHandler);
    scene.input.on('pointerup', this._upHandler);
    scene.input.on('pointerupoutside', this._upHandler);
    scene.input.on('gameout', this._resetHandler);
    scene.game.events.on('blur', this._resetHandler);
    scene.events.on('pause', this._resetHandler);
    scene.scale.on('resize', this._layoutHandler);
    scene.game.canvas.addEventListener('touchcancel', this._resetHandler);
    this.layout();
  }

  layout() {
    const pos = padPosition(this.scene.scale.height);
    this._container.setPosition(pos.x, pos.y);
    this.reset();
  }

  _move(pointer) {
    if (!pointer.isDown || !this.enabled) { this.reset(); return; }
    const x = pointer.x - this._container.x;
    const y = pointer.y - this._container.y;
    const distance = Math.hypot(x, y);
    const reach = PAD_RADIUS - 8;
    const divisor = Math.max(reach, distance);
    this.knob.setPosition(x / divisor * reach, y / divisor * reach);
    this._direction = distance < 7 ? { x: 0, y: 0 } : normalizeDirection({ x: x / reach, y: y / reach });
    this.onChange(this.getDirection());
  }

  // Retained for programmatic input and regression checks of digital directions.
  _setDir(id, value) {
    this._dir[id] = !!value;
    this._direction = { x: Number(!!this._dir.right) - Number(!!this._dir.left),
      y: Number(!!this._dir.down) - Number(!!this._dir.up) };
    this.onChange(this.getDirection());
  }

  getDirection() { return { ...this._direction }; }
  isActive() { return this._direction.x !== 0 || this._direction.y !== 0; }
  reset() {
    this._pointerId = null;
    this._dir = {};
    this._direction = { x: 0, y: 0 };
    this.knob.setPosition(0, 0);
    this.onChange(this.getDirection());
  }
  setEnabled(enabled) {
    if (this.enabled && !enabled) this.reset();
    this.enabled = !!enabled;
    this._container.setAlpha(this.enabled ? 1 : 0.35);
  }
  setVisible(visible) {
    this.visible = !!visible;
    this._container.setVisible(this.visible);
    if (!this.visible) this.reset();
  }
  destroy() {
    this.reset();
    const scene = this.scene;
    scene.input.off('pointermove', this._moveHandler);
    scene.input.off('pointerup', this._upHandler);
    scene.input.off('pointerupoutside', this._upHandler);
    scene.input.off('gameout', this._resetHandler);
    scene.game.events.off('blur', this._resetHandler);
    scene.events.off('pause', this._resetHandler);
    scene.scale.off('resize', this._layoutHandler);
    scene.game.canvas.removeEventListener('touchcancel', this._resetHandler);
    this._container.destroy();
  }
}
