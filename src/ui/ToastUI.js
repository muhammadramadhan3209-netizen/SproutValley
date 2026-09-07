export class ToastQueue {
  constructor(options = {}) {
    this.maxSize = options.maxSize ?? 5;
    this.defaultDurationMs = options.defaultDurationMs ?? 2500;
    this._items = [];
    this._consumed = [];
  }

  size() {
    return this._items.length;
  }

  totalSeen() {
    return this._consumed.length + this._items.length;
  }

  current() {
    return this._items.length > 0 ? this._items[0] : null;
  }

  pending() {
    return this._items.slice(1);
  }

  push(message, options = {}) {
    if (typeof message !== 'string' || !message) return false;
    const entry = {
      message,
      kind: options.kind || 'info',
      duration: Number.isFinite(options.duration) ? options.duration : this.defaultDurationMs,
      id: this._consumed.length + this._items.length + 1,
      ts: Date.now()
    };
    this._items.push(entry);
    while (this._items.length > this.maxSize) {
      this._items.shift();
    }
    return true;
  }

  consume() {
    const head = this._items.shift();
    if (head) this._consumed.push(head);
    return head || null;
  }

  clear() {
    const dropped = this._items.slice();
    this._items = [];
    this._consumed = [];
    return dropped;
  }

  kinds() {
    return ['quest', 'achievement', 'reward', 'info'];
  }

  static colorFor(kind) {
    const map = {
      quest: '#ffd700',
      achievement: '#9bd07a',
      reward: '#ffe066',
      info: '#cccccc'
    };
    return map[kind] || map.info;
  }

  static labelFor(kind) {
    const map = {
      quest: 'Quest',
      achievement: 'Achievement',
      reward: 'Reward',
      info: 'Info'
    };
    return map[kind] || map.info;
  }
}

export class ToastUI {
  constructor(scene) {
    this.scene = scene;
    this.queue = new ToastQueue();
    this._text = null;
    this._timer = null;
  }

  show(message, options = {}) {
    this.queue.push(message, options);
    this._renderCurrent();
    if (this._timer) this._timer.remove();
    const head = this.queue.current();
    if (!head) return;
    this._timer = this.scene.time.delayedCall(head.duration, () => {
      this.queue.consume();
      this._renderCurrent();
    });
  }

  _renderCurrent() {
    if (this._text && this._text.destroy) this._text.destroy();
    this._text = null;
    const head = this.queue.current();
    if (!head || !this.scene || !this.scene.add) return;
    const cam = this.scene.cameras && this.scene.cameras.main;
    const cx = cam ? cam.width / 2 : 240;
    const cy = 78;
    this._text = this.scene.add.text(cx, cy, head.message, {
      fontSize: '10px',
      align: 'center',
      wordWrap: { width: 220 },
      color: ToastQueue.colorFor(head.kind),
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 0).setDepth(150).setScrollFactor(0);
  }

  destroy() {
    if (this._timer) {
      this._timer.remove();
      this._timer = null;
    }
    if (this._text && this._text.destroy) this._text.destroy();
    this._text = null;
    this.queue.clear();
  }

  static colorFor(kind) {
    return ToastQueue.colorFor(kind);
  }

  static labelFor(kind) {
    return ToastQueue.labelFor(kind);
  }
}