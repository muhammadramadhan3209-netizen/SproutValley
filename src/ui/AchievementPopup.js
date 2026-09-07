export function formatAchievementPopupText(def) {
  if (!def || typeof def !== 'object') return null;
  return {
    title: 'ACHIEVEMENT UNLOCKED',
    name: def.title || def.id || '',
    reward: formatRewardLine(def.reward)
  };
}

function formatRewardLine(reward) {
  if (!reward || typeof reward !== 'object') return '';
  const parts = [];
  if (Number.isFinite(reward.gold) && reward.gold > 0) {
    parts.push(`+${reward.gold} Gold`);
  }
  if (Array.isArray(reward.items)) {
    for (const r of reward.items) {
      if (!r || !r.id || !r.quantity) continue;
      parts.push(`+${r.quantity} ${r.id}`);
    }
  }
  return parts.join('  ');
}

export class AchievementPopup {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this._bg = null;
    this._title = null;
    this._name = null;
    this._reward = null;
    this._timer = null;
    this._unsubscribers = [];
    this._build();
  }

  _build() {
    const scene = this.scene;
    const cam = scene.cameras && scene.cameras.main;
    const cx = cam ? cam.width / 2 : 240;
    const cy = cam ? cam.height / 2 : 135;
    const panelW = 240;
    const panelH = 64;

    this.container = scene.add.container(cx, cy).setDepth(220).setScrollFactor(0);
    this.container.setVisible(false);
    this.container.setAlpha(0);

    this._bg = scene.add.rectangle(0, 0, panelW, panelH, 0x1f1a12, 0.96);
    this._bg.setStrokeStyle(2, 0xffd700, 1);
    this._bg.setOrigin(0.5);
    this.container.add(this._bg);

    this._title = scene.add.text(0, -panelH / 2 + 8, 'ACHIEVEMENT UNLOCKED', {
      fontSize: '9px',
      color: '#ffd700',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0);
    this.container.add(this._title);

    this._name = scene.add.text(0, -panelH / 2 + 22, '', {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 0);
    this.container.add(this._name);

    this._reward = scene.add.text(0, -panelH / 2 + 38, '', {
      fontSize: '8px',
      color: '#ffe066',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0);
    this.container.add(this._reward);
  }

  show(def, options = {}) {
    const info = formatAchievementPopupText(def);
    if (!info) return false;
    const hold = Number.isFinite(options.hold) ? options.hold : 2500;
    const fadeIn = Number.isFinite(options.fadeIn) ? options.fadeIn : 250;
    const fadeOut = Number.isFinite(options.fadeOut) ? options.fadeOut : 400;

    if (this._timer) {
      this._timer.remove();
      this._timer = null;
    }
    if (this._tweenIn) { this._tweenIn.remove(); this._tweenIn = null; }
    if (this._tweenOut) { this._tweenOut.remove(); this._tweenOut = null; }

    this._name.setText(info.name);
    this._reward.setText(info.reward || '');
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.container.setScale(0.85);

    this._tweenIn = this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: fadeIn,
      ease: 'Sine.easeOut',
      onComplete: () => { this._tweenIn = null; }
    });

    this._timer = this.scene.time.delayedCall(hold, () => {
      this._tweenOut = this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        scaleX: 0.85,
        scaleY: 0.85,
        duration: fadeOut,
        ease: 'Sine.easeIn',
        onComplete: () => {
          this.container.setVisible(false);
          this._tweenOut = null;
        }
      });
    });

    return true;
  }

  bindToAchievementSystem(ach) {
    if (!ach || typeof ach.onChange !== 'function') return () => {};
    const off = ach.onChange((event, data) => {
      if (event !== 'unlock') return;
      if (!data || !data.achievement) return;
      this.show(data.achievement);
    });
    this._unsubscribers.push(off);
    return off;
  }

  destroy() {
    if (this._timer) this._timer.remove();
    if (this._tweenIn) this._tweenIn.remove();
    if (this._tweenOut) this._tweenOut.remove();
    for (const off of this._unsubscribers) {
      try { off(); } catch (e) { /* noop */ }
    }
    this._unsubscribers = [];
    if (this.container && this.container.destroy) this.container.destroy();
    this.container = null;
  }
}