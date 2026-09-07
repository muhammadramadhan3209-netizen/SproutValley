import { NPC, TILE_SIZE, SCENE_NPC_SPRITE } from '../config/constants.js';
import { sheetColumns } from '../config/assetFrames.js';
import npcsData from '../data/npcs.json' with { type: 'json' };

export class NPCSystem {
  constructor(scene, timeSystem = null) {
    this.scene = scene;
    this.timeSystem = timeSystem;
    this.npcsData = npcsData;
    this.npcs = {};
    this.sprites = {};
    this.presence = {};
    this.dialogState = {
      active: false,
      npcId: null,
      pageId: null,
      text: [],
      choices: [],
      advance: null
    };
    this._listeners = new Set();
  }

  static get DIALOG_STATE() {
    return {
      IDLE: 'idle',
      ACTIVE: 'active',
      CHOICE: 'choice',
      CLOSING: 'closing'
    };
  }

  setTimeSystem(timeSystem) {
    this.timeSystem = timeSystem;
    this._refreshAvailability();
  }

  isDialogActive() {
    return this.dialogState.active;
  }

  currentDialog() {
    if (!this.dialogState.active) return null;
    return {
      npcId: this.dialogState.npcId,
      pageId: this.dialogState.pageId,
      text: this.dialogState.text.slice(),
      choices: this.dialogState.choices.slice()
    };
  }

  isAvailable(npcId) {
    if (!this.npcs[npcId]) return false;
    if (!this.timeSystem) return true;
    const phase = this.timeSystem.getPhase();
    const phases = this.npcs[npcId].availablePhases;
    if (!phases || phases.length === 0) return true;
    return phases.includes(phase);
  }

  isMet(npcId) {
    return !!this.presence[npcId]?.met;
  }

  setMet(npcId, met) {
    if (!this.npcs[npcId]) return;
    if (!this.presence[npcId]) this.presence[npcId] = { met: false, lastDialogPageId: null };
    this.presence[npcId].met = !!met;
    this._notify('met', { npcId, met: !!met });
  }

  spawnAll() {
    if (!this.scene) return;
    for (const [npcId, def] of Object.entries(this.npcsData)) {
      if (def.scene !== this._expectedScene()) continue;
      this.spawn(npcId, def);
    }
    this._refreshAvailability();
  }

  _expectedScene() {
    if (!this.scene) return null;
    return this.scene.scene?.key || null;
  }

  spawn(npcId, def = null) {
    if (!this.scene || !this.scene.add) return null;
    if (!def) def = this.npcsData[npcId];
    if (!def) return null;
    if (this.npcs[npcId]) return this.npcs[npcId];
    if (Object.keys(this.npcs).length >= NPC.maxNpcs) return null;
    const px = (def.tileX || 0) * TILE_SIZE + TILE_SIZE / 2;
    const py = (def.tileY || 0) * TILE_SIZE + TILE_SIZE;
    const sprite = this._createSprite(px, py, def);
    if (!sprite) return null;
    this.npcs[npcId] = {
      id: npcId,
      name: def.name,
      tileX: def.tileX,
      tileY: def.tileY,
      x: px,
      y: py,
      dialog: def.dialog || {},
      availablePhases: def.availablePhases || NPC.defaultAvailablePhases,
      spriteKey: def.spriteKey || 'farmer',
      scene: def.scene
    };
    this.sprites[npcId] = sprite;
    if (!this.presence[npcId]) {
      this.presence[npcId] = { met: false, lastDialogPageId: null };
    }
    this._notify('spawn', this.npcs[npcId]);
    return this.npcs[npcId];
  }

  _createSprite(x, y, def) {
    const spriteKey = def.spriteKey || 'farmer';
    const meta = this._resolveSpriteMeta(spriteKey);
    if (!meta) return null;
    const sprite = this.scene.add.image(x, y, meta.sheet, meta.frame);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(32, 32);
    sprite.setDepth(8);
    return sprite;
  }

  _resolveSpriteMeta(spriteKey) {
    const meta = SCENE_NPC_SPRITE[spriteKey] || SCENE_NPC_SPRITE.farmer;
    return { sheet: meta.sheet, frame: meta.row * sheetColumns(meta.sheet) + meta.col };
  }

  despawn(npcId) {
    if (!this.npcs[npcId]) return;
    if (this.sprites[npcId] && this.sprites[npcId].destroy) {
      this.sprites[npcId].destroy();
    }
    delete this.sprites[npcId];
    delete this.npcs[npcId];
    this._notify('despawn', { npcId });
  }

  despawnAll() {
    for (const npcId of Object.keys(this.npcs)) this.despawn(npcId);
  }

  getAll() {
    return Object.values(this.npcs);
  }

  getAt(x, y, rangeTiles = NPC.interactRangeTiles) {
    let best = null;
    let bestDist = Infinity;
    for (const npc of this.getAll()) {
      const dx = npc.x - x;
      const dy = (npc.y - 16) - (y - 16);
      const d = Math.sqrt(dx * dx + dy * dy);
      const dTiles = d / TILE_SIZE;
      if (dTiles <= rangeTiles && d < bestDist) {
        best = npc;
        bestDist = d;
      }
    }
    return best;
  }

  _refreshAvailability() {
    for (const npcId of Object.keys(this.npcs)) {
      const npc = this.npcs[npcId];
      const isAvail = this.isAvailable(npcId);
      const sprite = this.sprites[npcId];
      if (sprite) sprite.setAlpha(isAvail ? 1.0 : 0.5);
      this._notify('availability', { npcId, available: isAvail });
    }
  }

  update(time, delta) {
    if (!this.timeSystem) return;
    this._refreshAvailability();
  }

  openDialog(npcId, pageId = null) {
    const npc = this.npcs[npcId];
    if (!npc) return { ok: false, reason: 'unknown_npc' };
    if (!this.isAvailable(npcId)) return { ok: false, reason: 'not_available' };
    if (this.dialogState.active) return { ok: false, reason: 'dialog_already_active' };
    const dialog = npc.dialog || {};
    const startPageId = pageId || (this.presence[npcId]?.lastDialogPageId) || 'start';
    const page = dialog[startPageId];
    if (!page) return { ok: false, reason: 'no_page' };
    this.dialogState.active = true;
    this.dialogState.npcId = npcId;
    this.dialogState.pageId = page.id;
    this.dialogState.text = Array.isArray(page.text) ? page.text.slice() : [String(page.text || '')];
    this.dialogState.choices = Array.isArray(page.choices) ? page.choices.slice() : [];
    this.dialogState.advance = page.next || null;
    this.setMet(npcId, true);
    this.presence[npcId].lastDialogPageId = startPageId;
    this._notify('dialogOpen', { npcId, pageId: startPageId });
    return { ok: true };
  }

  advanceDialog() {
    if (!this.dialogState.active) return { ok: false, reason: 'no_active_dialog' };
    if (this.dialogState.choices && this.dialogState.choices.length > 0) {
      return { ok: false, reason: 'awaiting_choice' };
    }
    const next = this.dialogState.advance;
    if (!next) {
      this._runEffects([{ type: 'close' }]);
      return { ok: true, closed: true };
    }
    return this._gotoPage(next);
  }

  chooseDialog(choiceIndex) {
    if (!this.dialogState.active) return { ok: false, reason: 'no_active_dialog' };
    const choice = this.dialogState.choices[choiceIndex];
    if (!choice) return { ok: false, reason: 'invalid_choice' };
    this._runEffects(choice.effects || []);
    if (choice.next) return this._gotoPage(choice.next);
    this._runEffects([{ type: 'close' }]);
    return { ok: true, closed: true };
  }

  closeDialog() {
    if (!this.dialogState.active) return false;
    const npcId = this.dialogState.npcId;
    this.dialogState.active = false;
    this.dialogState.npcId = null;
    this.dialogState.pageId = null;
    this.dialogState.text = [];
    this.dialogState.choices = [];
    this.dialogState.advance = null;
    this._notify('dialogClose', { npcId });
    return true;
  }

  _gotoPage(pageId) {
    const npcId = this.dialogState.npcId;
    const npc = this.npcs[npcId];
    if (!npc) return { ok: false, reason: 'no_npc' };
    const page = npc.dialog?.[pageId];
    if (!page) {
      this._runEffects([{ type: 'close' }]);
      return { ok: true, closed: true };
    }
    const pageChoices = Array.isArray(page.choices) ? page.choices.slice() : [];
    const pageNext = page.next || null;
    if (!pageNext && pageChoices.length === 0) {
      this.dialogState.pageId = page.id;
      this.dialogState.text = Array.isArray(page.text) ? page.text.slice() : [String(page.text || '')];
      this.dialogState.choices = pageChoices;
      this.dialogState.advance = null;
      if (this.presence[npcId]) this.presence[npcId].lastDialogPageId = pageId;
      this._notify('dialogPage', { npcId, pageId });
      this._runEffects([{ type: 'close' }]);
      return { ok: true, closed: true };
    }
    this.dialogState.pageId = page.id;
    this.dialogState.text = Array.isArray(page.text) ? page.text.slice() : [String(page.text || '')];
    this.dialogState.choices = pageChoices;
    this.dialogState.advance = pageNext;
    if (this.presence[npcId]) this.presence[npcId].lastDialogPageId = pageId;
    this._notify('dialogPage', { npcId, pageId });
    return { ok: true };
  }

  _runEffects(effects) {
    if (!Array.isArray(effects)) return;
    for (const eff of effects) {
      if (!eff || typeof eff !== 'object') continue;
      if (eff.type === 'close') {
        this.closeDialog();
      } else if (eff.type === 'start_quest' && eff.questId && this._onStartQuest) {
        this._onStartQuest(eff.questId);
      } else if (eff.type === 'complete_quest' && eff.questId && this._onCompleteQuest) {
        this._onCompleteQuest(eff.questId);
      }
    }
  }

  setQuestHandlers({ onStart, onComplete } = {}) {
    this._onStartQuest = onStart || null;
    this._onCompleteQuest = onComplete || null;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.presence));
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    for (const [npcId, state] of Object.entries(snapshot)) {
      if (!this.npcs[npcId]) continue;
      if (!state || typeof state !== 'object') continue;
      this.presence[npcId] = {
        met: !!state.met,
        lastDialogPageId: typeof state.lastDialogPageId === 'string' ? state.lastDialogPageId : null
      };
    }
    this._notify('restore', null);
    return true;
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(event, data) {
    for (const fn of this._listeners) {
      try { fn(event, data); } catch (e) { /* noop */ }
    }
  }
}