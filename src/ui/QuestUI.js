import { addCloseButton } from './sceneLayout.js';
export function formatQuestLine(questOrDef, def, itemSystem = null) {
  if (!questOrDef || !def) return null;
  const isInstance = typeof questOrDef.objectives === 'object' && questOrDef.progress !== undefined;
  const state = questOrDef.state || (isInstance ? 'active' : 'available');
  const isCompleted = state === 'completed' || (isInstance && questOrDef.progress &&
    Object.entries(questOrDef.objectives || {}).every(([k, req]) => (questOrDef.progress[k] || 0) >= req));

  let progressText = '';
  if (isInstance && !isCompleted) {
    const parts = [];
    const objectives = questOrDef.objectives || {};
    for (const [key, required] of Object.entries(objectives)) {
      const cur = questOrDef.progress[key] || 0;
      parts.push(`${cur}/${required}`);
    }
    progressText = parts.join(' ');
  }

  const objectivesText = buildObjectivesText(def.objectives, itemSystem);
  const rewardText = formatRewardText(def.reward, itemSystem);

  let marker = '[ ]';
  let status = '';
  if (state === 'completed' || isCompleted) {
    marker = '[v]';
    status = 'COMPLETE';
  } else if (state === 'failed') {
    marker = '[x]';
    status = 'FAILED';
  } else {
    marker = '[>]';
    status = 'active';
  }

  return {
    marker,
    title: def.title || questOrDef.id,
    description: def.description || '',
    objectivesText,
    progressText,
    rewardText,
    status,
    state,
    isCompleted: state === 'completed' || isCompleted
  };
}

function buildObjectivesText(objectives, itemSystem) {
  if (!objectives || typeof objectives !== 'object') return '';
  const parts = [];
  for (const [key, required] of Object.entries(objectives)) {
    let label = key;
    if (itemSystem && typeof itemSystem.get === 'function') {
      const def = itemSystem.get(key);
      if (def && def.name) label = def.name;
    }
    parts.push(`${label} (${required})`);
  }
  return parts.join(', ');
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

export function buildQuestView(questSystem, itemSystem = null) {
  const view = { active: [], completed: [] };
  if (!questSystem) return view;
  const active = (questSystem.getActive ? questSystem.getActive() : []).slice();
  for (const q of active) {
    const def = questSystem.get(q.id);
    if (!def) continue;
    const line = formatQuestLine(q, def, itemSystem);
    if (line) view.active.push(line);
  }
  const completed = (questSystem.getCompleted ? questSystem.getCompleted() : []).slice();
  for (const q of completed) {
    const def = questSystem.get(q.id);
    if (!def) continue;
    const line = formatQuestLine(q, def, itemSystem);
    if (line) view.completed.push(line);
  }
  return view;
}

export class QuestUI {
  constructor(scene, questSystem, economySystem, inventorySystem, itemSystem) {
    this.scene = scene;
    this.quest = questSystem;
    this.economy = economySystem;
    this.inventory = inventorySystem;
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

    this._titleText = scene.add.text(0, -panelH / 2 + 10, 'QUEST LOG', {
      fontSize: '11px',
      color: '#ffeebb',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    this.container.add(this._titleText);

    this._listContainer = scene.add.container(0, -panelH / 2 + 30);
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

    if (this.quest && typeof this.quest.onChange === 'function') {
      const off = this.quest.onChange(() => {
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
    if (!this._listContainer || !this.quest) return;
    const view = buildQuestView(this.quest, this.items);
    this._list = view.active.concat(view.completed);
    if (this.selectedIndex >= this._list.length) this.selectedIndex = 0;

    this._listContainer.removeAll(true);
    if (this._list.length === 0) {
      const empty = this.scene.add.text(0, 0, 'No quests yet - talk to NPCs', {
        fontSize: '9px',
        color: '#888888',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5);
      this._listContainer.add(empty);
      return;
    }

    const rowH = 28;
    const max = Math.min(this._list.length, 7);
    for (let i = 0; i < max; i++) {
      const line = this._list[i];
      const isSel = i === this.selectedIndex;
      const titleColor = line.isCompleted
        ? '#9bd07a'
        : (isSel ? '#ffd700' : '#ffffff');
      const titleText = this.scene.add.text(0, i * rowH, `${isSel ? '>' : ' '} ${line.marker} ${line.title}`, {
        fontSize: '8px',
        color: titleColor,
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 0);
      const detailColor = line.isCompleted ? '#9bd07a' : '#888888';
      const detail = line.progressText
        ? `${line.progressText}`
        : (line.objectivesText || line.status);
      const detailText = this.scene.add.text(0, i * rowH + 10, `   ${detail}${line.rewardText ? '  ' + line.rewardText : ''}`, {
        fontSize: '7px',
        color: detailColor,
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 0);
      this._listContainer.add([titleText, detailText]);
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