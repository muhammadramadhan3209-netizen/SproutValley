import { EventEmitter } from 'node:events';

export class DisplayStub extends EventEmitter {
  constructor(x = 0, y = 0, width = 16, height = 16) {
    super();
    Object.assign(this, { x, y, width, height, visible: true, scaleX: 1, scaleY: 1, list: [] });
  }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setOrigin(x, y = x) { this.originX = x; this.originY = y; return this; }
  setDepth(v) { this.depth = v; return this; }
  setScrollFactor(x, y = x) { this.scrollFactorX = x; this.scrollFactorY = y; return this; }
  setVisible(v) { this.visible = v; return this; }
  setAlpha(v) { this.alpha = v; return this; }
  setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; }
  setTexture(key, frame) { this.texture = key; this.frame = frame; return this; }
  setFrame(frame) { this.frame = frame; return this; }
  setTint(tint) { this.tint = tint; return this; }
  setText(text) { this.text = text; return this; }
  setStrokeStyle() { return this; }
  setFillStyle() { return this; }
  setInteractive() { this.interactive = true; return this; }
  add(children) { for (const child of [].concat(children)) { child.parentContainer = this; this.list.push(child); } return this; }
  destroy() { this.destroyed = true; this.removeAllListeners(); for (const child of this.list) child.destroy(); }
}

export function makeScene(width = 480, height = 270) {
  const scale = Object.assign(new EventEmitter(), { width, height });
  const keys = new Map();
  const keyboard = {
    addKey(code) { if (!keys.has(code)) keys.set(code, { isDown: false }); return keys.get(code); },
    createCursorKeys() { return Object.fromEntries(['left', 'right', 'up', 'down'].map(key => [key, this.addKey(key)])); },
    resetKeys() { for (const key of keys.values()) key.isDown = false; }
  };
  const scene = {
    scale, events: new EventEmitter(), input: Object.assign(new EventEmitter(), { keyboard }),
    cameras: { main: { width, height, setBackgroundColor() {} } },
    game: { events: new EventEmitter(), canvas: new EventTarget() },
    add: {
      container: (x, y) => new DisplayStub(x, y),
      rectangle: (x, y, w, h) => new DisplayStub(x, y, w, h),
      circle: (x, y, r) => new DisplayStub(x, y, r * 2, r * 2),
      text: (x, y, text) => new DisplayStub(x, y).setText(text),
      image: (x, y, key, frame) => new DisplayStub(x, y).setTexture(key, frame),
      existing() {}
    },
    tweens: { add: () => ({ remove() {} }) },
    time: { now: 0, delayedCall: () => ({ remove() {} }) }
  };
  return scene;
}
