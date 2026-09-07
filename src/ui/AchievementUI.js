import { addCloseButton } from './sceneLayout.js';
export function formatAchievementLine(def, progress, isUnlocked, itemSystem = null) {
  if (!def || typeof def !== 'object') return null;
  const target = Number.isFinite(def.target) ? def.target : 0;
  const cur = Number.isFinite(progress) ? Math.max(0, Math.min(target, progress)) : 0;
  const unlocked = !!isUnlocked;
  const marker = unlocked ? '[v]' : '[ ]';
  const status = unlocked ? 'DONE' : `${cur}/${target}`;
  const reward = formatRewardText(def.reward, itemSystem);
  return {
    marker,
    title: def.title || def.id,
    description: def.description || '',
    status,
    reward,
    isUnlocked: unlocked,
    progress: cur,
    target
  };
}

function formatRewardText(reward, itemSystem) {
  if (!reward || typeof reward !== 'object') return '';
  const parts = [];
  if (Number.isFinite(reward.gold) && reward.gold > 0) {
    parts.push(`+${reward.gold}g`);
  }
  if (Array.isArray(reward.items)) {
    for (const r of reward.items) {
      if (!r || !r.id || !r.quantity) continue;
      let name = r.id;
      if (itemSystem && typeof itemSystem.getName === 'function') {
        name = itemSystem.getName(r.id);
      } else if (itemSystem && typeof itemSystem.get === 'function') {
        const def = itemSystem.get(r.id);
        if (def && def.name) name = def.name;
      }
      parts.push(`+${r.quantity} ${name}`);
    }
  }
  return parts.join('  ');
}

export class AchievementUI {
  constructor(scene, achievementSystem, itemSystem = null) {
    this.scene = scene;
    this.achievement = achievementSystem;
    this.items = itemSystem;
    this.visible = false;
    this.selectedIndex = 0;
    this._list = [];
    this.container = null;
    this._listContainer = null;
    this._titleText = null;
    this._hintText = null;
    this._unsubscribers = [];
    this._build();
  }

  _build() {
    const scene = this.scene;
    const cam = scene.cameras && scene.cameras.main;
    const cx = cam ? cam.width / 2 : 240;
    const cy = cam ? cam.height / 2 : 135;
    const panelW = 260;
    const panelH = 220;
    this.panelHeight = panelH;

    this.container = scene.add.container(cx, cy).setDepth(200).setScrollFactor(0);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(0, 0, panelW, panelH, 0x1f1a12, 0.96);
    bg.setStrokeStyle(2, 0xb9a779, 1);
    bg.setOrigin(0.5);
    this.container.add(bg);

    this._titleText = scene.add.text(0, -panelH / 2 + 10, 'ACHIEVEMENTS', {
      fontSize: '11px',
      color: '#ffeebb',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    this.container.add(this._titleText);

    this._listContainer = scene.add.container(0, -panelH / 2 + 36);
    this.container.add(this._listContainer);

    this._hintText = scene.add.text(0, panelH / 2 - 8, 'ESC close  -  up/down select', {
      fontSize: '7px',
      color: '#888888',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    this.container.add(this._hintText);
    addCloseButton(scene, this.container, panelW, panelH, () => this.hide());

    if (this.achievement && typeof this.achievement.onChange === 'function') {
      const off = this.achievement.onChange(() => {
        if (this.visible) this.refresh();
      });
      this._unsubscribers.push(off);
    }

    this.refresh();
  }

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  show() {
    if (!this.container) return;
    this.container.setVisible(true);
    this.visible = true;
    this.refresh();
  }

  hide() {
    if (!this.container) return;
    this.container.setVisible(false);
    this.visible = false;
  }

  isVisible() {
    return this.visible;
  }

  refresh() {
    if (!this._listContainer || !this.achievement) return;
    this._list = this.achievement.listAll().slice();
    if (this.selectedIndex >= this._list.length) this.selectedIndex = 0;

    this._listContainer.removeAll(true);
    if (this._list.length === 0) {
      const empty = this.scene.add.text(0, 0, 'No achievements registered', {
        fontSize: '9px',
        color: '#888888',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5);
      this._listContainer.add(empty);
      return;
    }

    const rowH = 26;
    const max = Math.min(this._list.length, 7);
    for (let i = 0; i < max; i++) {
      const id = this._list[i];
      const def = this.achievement.get(id);
      if (!def) continue;
      const isUnlocked = this.achievement.isUnlocked(id);
      const progress = this.achievement.progress[id] || 0;
      const line = formatAchievementLine(def, progress, isUnlocked, this.items);
      if (!line) continue;
      const isSel = i === this.selectedIndex;
      const titleColor = line.isUnlocked ? '#9bd07a' : (isSel ? '#ffd700' : '#cccccc');
      const titleText = this.scene.add.text(0, i * rowH, `${isSel ? '>' : ' '} ${line.marker} ${line.title}`, {
        fontSize: '8px',
        color: titleColor,
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 0);
      const statusText = this.scene.add.text(0, i * rowH + 10, `   ${line.status}${line.reward ? '   ' + line.reward : ''}`, {
        fontSize: '7px',
        color: line.isUnlocked ? '#9bd07a' : '#888888',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 0);
      this._listContainer.add([titleText, statusText]);
    }
  }

  moveSelection(delta) {
    if (this._list.length === 0) return;
    const len = this._list.length;
    this.selectedIndex = (this.selectedIndex + delta + len) % len;
    this.refresh();
  }

  getSelected() {
    return this._list[this.selectedIndex] || null;
  }

  destroy() {
    for (const off of this._unsubscribers) {
      try { off(); } catch (e) { /* noop */ }
    }
    this._unsubscribers = [];
    if (this.container && this.container.destroy) this.container.destroy();
    this.container = null;
  }
}