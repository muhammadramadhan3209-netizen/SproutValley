import { SaveManager, InMemoryStorage, SAVE_KEYS } from '../utils/SaveManager.js';
import { INVENTORY, FARMING, FARM_WORLD, LAKE_WORLD, TIME, TIME_OF_DAY, ECONOMY, DECORATION, NPC, QUEST, ACHIEVEMENT } from '../config/constants.js';

const CURRENT_VERSION = 1;
const DEFAULT_SAVE = () => ({
  meta: {
    version: CURRENT_VERSION,
    savedAt: 0,
    gameStartedAt: 0,
    scene: 'FarmScene'
  },
  inventory: {
    slots: new Array(INVENTORY.capacity).fill(null),
    activeSlot: INVENTORY.defaultSelectedSlot
  },
  farming: {
    plots: {}
  },
  player: {
    farm: null,
    lake: null
  },
  time: {
    currentDay: TIME.startDay,
    currentTime: TIME.startTime,
    gameStartedDay: TIME.startDay,
    tickCount: 0
  },
  economy: {
    gold: ECONOMY.startingGold,
    totalEarned: 0,
    totalSpent: 0,
    transactions: 0
  },
  decorations: [],
  npcs: {},
  quests: {
    active: [],
    completed: [],
    failed: []
  },
  achievements: {
    unlocked: [],
    progress: {}
  }
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

export class SaveSystem {
  constructor(manager = null) {
    this.manager = manager ?? new SaveManager();
    this.data = DEFAULT_SAVE();
    this.lastSaveAt = 0;
    this.dirty = false;
  }

  isStorageAvailable() {
    return this.manager.isAvailable();
  }

  hasSave() {
    return this.manager.has(SAVE_KEYS.GAME);
  }

  loadGame() {
    const raw = this.manager.load(SAVE_KEYS.GAME);
    if (raw === null) return null;
    const validated = this._validateAndMigrate(raw);
    if (!validated) {
      console.warn('[SaveSystem] invalid save data, returning null');
      return null;
    }
    this.data = validated;
    return clone(this.data);
  }

  saveGame(extraPatch = null) {
    if (extraPatch && isPlainObject(extraPatch)) {
      this.data = this._merge(this.data, extraPatch);
    }
    this.data.meta = {
      ...(this.data.meta || {}),
      version: CURRENT_VERSION,
      savedAt: Date.now()
    };
    const ok = this.manager.save(SAVE_KEYS.GAME, this.data);
    if (ok) {
      this.lastSaveAt = Date.now();
      this.dirty = false;
    }
    return ok;
  }

  clearSave() {
    const ok = this.manager.remove(SAVE_KEYS.GAME);
    this.data = DEFAULT_SAVE();
    this.dirty = false;
    return ok;
  }

  markDirty() {
    this.dirty = true;
  }

  getData() {
    return clone(this.data);
  }

  setInventorySnapshot(slots, activeSlot) {
    const safeSlots = new Array(INVENTORY.capacity).fill(null);
    if (Array.isArray(slots)) {
      for (let i = 0; i < INVENTORY.capacity && i < slots.length; i++) {
        const s = slots[i];
        if (s && typeof s.itemId === 'string' && Number.isFinite(s.quantity)) {
          if (s.quantity > 0) {
            safeSlots[i] = { itemId: s.itemId, quantity: Math.floor(s.quantity) };
          }
        }
      }
    }
    this.data.inventory = {
      slots: safeSlots,
      activeSlot: Math.max(0, Math.min(INVENTORY.capacity - 1, Number(activeSlot) || 0))
    };
    this.markDirty();
  }

  setFarmingSnapshot(plotsMap) {
    const plots = {};
    if (plotsMap && typeof plotsMap.forEach === 'function') {
      plotsMap.forEach((plot, key) => {
        if (!plot) return;
        plots[String(key)] = {
          state: plot.state,
          cropId: plot.cropId ?? null,
          stage: Math.max(0, Math.floor(plot.stage || 0)),
          plantedAt: Number(plot.plantedAt) || 0,
          lastWateredAt: Number(plot.lastWateredAt) || 0,
          progress: Number(plot.progress) || 0
        };
      });
    }
    this.data.farming = { plots };
    this.markDirty();
  }

  setPlayerPosition(sceneKey, x, y) {
    if (sceneKey === 'FarmScene') {
      this.data.player.farm = { x: Number(x) || 0, y: Number(y) || 0 };
    } else if (sceneKey === 'LakeScene') {
      this.data.player.lake = { x: Number(x) || 0, y: Number(y) || 0 };
    }
    this.markDirty();
  }

  setLastScene(sceneKey) {
    this.data.meta.scene = sceneKey;
    this.markDirty();
  }

  setGameStartedAt(timestamp) {
    this.data.meta.gameStartedAt = timestamp ?? Date.now();
    this.markDirty();
  }

  setTimeSnapshot(timeSystem) {
    if (!timeSystem || typeof timeSystem.snapshot !== 'function') return;
    const snap = timeSystem.snapshot();
    this.data.time = {
      currentDay: Math.max(1, Math.floor(Number(snap.currentDay) || TIME.startDay)),
      currentTime: Math.max(0, Math.min(0.999, Number(snap.currentTime) || TIME.startTime)),
      gameStartedDay: Math.max(1, Math.floor(Number(snap.gameStartedDay) || TIME.startDay)),
      tickCount: Math.max(0, Math.floor(Number(snap.tickCount) || 0))
    };
    this.markDirty();
  }

  restoreTimeTo(timeSystem) {
    if (!timeSystem || typeof timeSystem.restore !== 'function') return false;
    return timeSystem.restore(this.data.time);
  }

  setEconomySnapshot(economySystem) {
    if (!economySystem || typeof economySystem.snapshot !== 'function') return;
    const snap = economySystem.snapshot();
    this.data.economy = {
      gold: Math.max(0, Math.floor(Number(snap.gold) || 0)),
      totalEarned: Math.max(0, Math.floor(Number(snap.totalEarned) || 0)),
      totalSpent: Math.max(0, Math.floor(Number(snap.totalSpent) || 0)),
      transactions: Math.max(0, Math.floor(Number(snap.transactions) || 0))
    };
    this.markDirty();
  }

  restoreEconomyTo(economySystem) {
    if (!economySystem || typeof economySystem.restore !== 'function') return false;
    return economySystem.restore(this.data.economy);
  }

  setDecorationSnapshot(decorationSystem) {
    if (!decorationSystem || typeof decorationSystem.snapshot !== 'function') return;
    const snap = decorationSystem.snapshot();
    this.data.decorations = snap.map(d => ({
      id: d.id,
      x: Math.floor(Number(d.x) || 0),
      y: Math.floor(Number(d.y) || 0)
    }));
    this.markDirty();
  }

  restoreDecorationsTo(decorationSystem) {
    if (!decorationSystem || typeof decorationSystem.restore !== 'function') return false;
    return decorationSystem.restore(this.data.decorations);
  }

  setNpcSnapshot(npcSystem) {
    if (!npcSystem || typeof npcSystem.snapshot !== 'function') return;
    const snap = npcSystem.snapshot();
    this.data.npcs = {};
    for (const [npcId, state] of Object.entries(snap)) {
      this.data.npcs[npcId] = {
        met: !!state.met,
        lastDialogPageId: typeof state.lastDialogPageId === 'string' ? state.lastDialogPageId : null
      };
    }
    this.markDirty();
  }

  restoreNpcsTo(npcSystem) {
    if (!npcSystem || typeof npcSystem.restore !== 'function') return false;
    return npcSystem.restore(this.data.npcs);
  }

  setQuestSnapshot(questSystem) {
    if (!questSystem || typeof questSystem.snapshot !== 'function') return;
    this.data.quests = questSystem.snapshot();
    this.markDirty();
  }

  restoreQuestsTo(questSystem) {
    if (!questSystem || typeof questSystem.restore !== 'function') return false;
    return questSystem.restore(this.data.quests);
  }

  setAchievementSnapshot(achievementSystem) {
    if (!achievementSystem || typeof achievementSystem.snapshot !== 'function') return;
    const snap = achievementSystem.snapshot();
    const progress = {};
    if (snap.progress && typeof snap.progress === 'object') {
      for (const [k, v] of Object.entries(snap.progress)) {
        if (typeof k !== 'string' || !k) continue;
        if (!Number.isFinite(v) || v < 0) continue;
        progress[k] = Math.floor(v);
        if (Object.keys(progress).length >= ACHIEVEMENT.maxAchievements) break;
      }
    }
    const unlocked = [];
    if (Array.isArray(snap.unlocked)) {
      for (const u of snap.unlocked) {
        if (!u || typeof u !== 'object') continue;
        if (typeof u.id !== 'string' || !u.id) continue;
        unlocked.push({
          id: u.id,
          unlockedAtDay: Number.isFinite(u.unlockedAtDay) ? Math.floor(u.unlockedAtDay) : null
        });
        if (unlocked.length >= ACHIEVEMENT.maxAchievements) break;
      }
    }
    this.data.achievements = { unlocked, progress };
    this.markDirty();
  }

  restoreAchievementsTo(achievementSystem) {
    if (!achievementSystem || typeof achievementSystem.restore !== 'function') return false;
    return achievementSystem.restore(this.data.achievements);
  }

  restoreInventoryTo(inventorySystem) {
    if (!inventorySystem) return false;
    const inv = this.data.inventory;
    if (!inv || !Array.isArray(inv.slots)) return false;
    const target = new Array(INVENTORY.capacity).fill(null);
    for (let i = 0; i < target.length && i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (s && typeof s.itemId === 'string' && s.quantity > 0) {
        target[i] = { itemId: s.itemId, quantity: s.quantity };
      }
    }
    inventorySystem.slots = target;
    inventorySystem.activeSlot = Math.max(0, Math.min(INVENTORY.capacity - 1, inv.activeSlot || 0));
    return true;
  }

  restoreFarmingTo(farmingSystem) {
    if (!farmingSystem || !farmingSystem.plots) return false;
    const saved = this.data.farming?.plots;
    if (!saved || typeof saved !== 'object') return false;

    let restored = 0;
    for (const [key, savedPlot] of Object.entries(saved)) {
      const plot = farmingSystem.plots.get(key);
      if (!plot) continue;
      plot.state = savedPlot.state ?? plot.state;
      plot.cropId = savedPlot.cropId ?? null;
      plot.stage = Math.max(0, Math.floor(savedPlot.stage || 0));
      plot.progress = Number(savedPlot.progress) || 0;
      plot.plantedAt = Number(savedPlot.plantedAt) || 0;
      plot.lastWateredAt = Number(savedPlot.lastWateredAt) || 0;

      if (plot.cropId) {
        farmingSystem._updateSoilTile(plot);
        farmingSystem._updateCropSprite(plot);
      } else if (
        plot.state === 'tilled' ||
        plot.state === 'tilled_watered' ||
        plot.state === 'planted' ||
        plot.state === 'planted_watered'
      ) {
        farmingSystem._updateSoilTile(plot);
      }
      restored++;
    }
    return restored;
  }

  restorePlayerPosition(sceneKey) {
    const pos = sceneKey === 'FarmScene' ? this.data.player.farm
      : sceneKey === 'LakeScene' ? this.data.player.lake
      : null;
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  getLastScene() {
    return this.data.meta?.scene || 'FarmScene';
  }

  _merge(target, patch) {
    if (!isPlainObject(patch)) return target;
    const out = Array.isArray(target) ? target.slice() : { ...target };
    for (const key of Object.keys(patch)) {
      const pv = patch[key];
      if (isPlainObject(pv) && isPlainObject(out[key])) {
        out[key] = this._merge(out[key], pv);
      } else {
        out[key] = pv;
      }
    }
    return out;
  }

  _validateAndMigrate(raw) {
    if (!isPlainObject(raw)) return null;
    if (!isPlainObject(raw.meta)) return null;
    const version = raw.meta.version;
    if (version !== CURRENT_VERSION) {
      console.warn('[SaveSystem] unknown save version', version, 'falling back to default');
      return DEFAULT_SAVE();
    }
    if (!isPlainObject(raw.inventory)) return null;
    if (!Array.isArray(raw.inventory.slots)) return null;
    if (raw.inventory.slots.length !== INVENTORY.capacity) {
      const fixed = new Array(INVENTORY.capacity).fill(null);
      for (let i = 0; i < INVENTORY.capacity && i < raw.inventory.slots.length; i++) {
        const s = raw.inventory.slots[i];
        if (s && typeof s === 'object' && typeof s.itemId === 'string' && Number.isFinite(s.quantity) && s.quantity > 0) {
          fixed[i] = { itemId: s.itemId, quantity: s.quantity };
        }
      }
      raw.inventory.slots = fixed;
    }
    for (let i = 0; i < raw.inventory.slots.length; i++) {
      const slot = raw.inventory.slots[i];
      if (slot === null) continue;
      if (typeof slot !== 'object') {
        raw.inventory.slots[i] = null;
        continue;
      }
      if (typeof slot.itemId !== 'string' || !Number.isFinite(slot.quantity) || slot.quantity < 1) {
        raw.inventory.slots[i] = null;
        continue;
      }
    }
    raw.inventory.activeSlot = Math.max(0, Math.min(INVENTORY.capacity - 1, Number(raw.inventory.activeSlot) || 0));

    if (!isPlainObject(raw.farming)) raw.farming = { plots: {} };
    if (!isPlainObject(raw.farming.plots)) raw.farming.plots = {};
    const validPlots = {};
    for (const [k, p] of Object.entries(raw.farming.plots)) {
      if (!isPlainObject(p)) continue;
      if (typeof k !== 'string') continue;
      validPlots[k] = {
        state: typeof p.state === 'string' ? p.state : 'grass',
        cropId: typeof p.cropId === 'string' ? p.cropId : null,
        stage: Math.max(0, Math.floor(Number(p.stage) || 0)),
        plantedAt: Number(p.plantedAt) || 0,
        lastWateredAt: Number(p.lastWateredAt) || 0,
        progress: Number(p.progress) || 0
      };
    }
    raw.farming.plots = validPlots;

    if (!isPlainObject(raw.player)) raw.player = { farm: null, lake: null };
    raw.player.farm = this._validateCoord(raw.player.farm);
    raw.player.lake = this._validateCoord(raw.player.lake);

    raw.meta.scene = typeof raw.meta.scene === 'string' ? raw.meta.scene : 'FarmScene';

    if (!isPlainObject(raw.time)) {
      raw.time = {
        currentDay: TIME.startDay,
        currentTime: TIME.startTime,
        gameStartedDay: TIME.startDay,
        tickCount: 0
      };
    } else {
      raw.time = {
        currentDay: Math.max(1, Math.floor(Number(raw.time.currentDay) || TIME.startDay)),
        currentTime: Math.max(0, Math.min(0.999, Number(raw.time.currentTime) || TIME.startTime)),
        gameStartedDay: Math.max(1, Math.floor(Number(raw.time.gameStartedDay) || TIME.startDay)),
        tickCount: Math.max(0, Math.floor(Number(raw.time.tickCount) || 0))
      };
    }

    if (!isPlainObject(raw.economy)) {
      raw.economy = {
        gold: ECONOMY.startingGold,
        totalEarned: 0,
        totalSpent: 0,
        transactions: 0
      };
    } else {
      raw.economy = {
        gold: Math.max(0, Math.floor(Number(raw.economy.gold) || 0)),
        totalEarned: Math.max(0, Math.floor(Number(raw.economy.totalEarned) || 0)),
        totalSpent: Math.max(0, Math.floor(Number(raw.economy.totalSpent) || 0)),
        transactions: Math.max(0, Math.floor(Number(raw.economy.transactions) || 0))
      };
    }

    if (!Array.isArray(raw.decorations)) {
      raw.decorations = [];
    } else {
      const validDecos = [];
      for (const d of raw.decorations) {
        if (!isPlainObject(d)) continue;
        if (typeof d.id !== 'string' || !d.id) continue;
        if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
        validDecos.push({
          id: d.id,
          x: Math.floor(d.x),
          y: Math.floor(d.y)
        });
        if (validDecos.length >= DECORATION.maxDecorations) break;
      }
      raw.decorations = validDecos;
    }

    if (!isPlainObject(raw.npcs)) {
      raw.npcs = {};
    } else {
      const validNpcs = {};
      for (const [npcId, state] of Object.entries(raw.npcs)) {
        if (typeof npcId !== 'string' || !npcId) continue;
        if (!isPlainObject(state)) continue;
        validNpcs[npcId] = {
          met: !!state.met,
          lastDialogPageId: typeof state.lastDialogPageId === 'string' ? state.lastDialogPageId : null
        };
        if (Object.keys(validNpcs).length >= NPC.maxNpcs) break;
      }
      raw.npcs = validNpcs;
    }

    if (!isPlainObject(raw.quests)) {
      raw.quests = { active: [], completed: [], failed: [] };
    } else {
      const validQuest = (arr) => {
        if (!Array.isArray(arr)) return [];
        const out = [];
        for (const q of arr) {
          if (!isPlainObject(q)) continue;
          if (typeof q.id !== 'string' || !q.id) continue;
          if (!isPlainObject(q.objectives)) continue;
          const validProgress = {};
          if (isPlainObject(q.progress)) {
            for (const [k, v] of Object.entries(q.progress)) {
              if (typeof k !== 'string' || !k) continue;
              if (!Number.isFinite(v) || v < 0) continue;
              validProgress[k] = Math.floor(v);
            }
          }
          out.push({
            id: q.id,
            startedDay: Math.max(1, Math.floor(Number(q.startedDay) || TIME.startDay)),
            completedDay: Number.isFinite(q.completedDay) ? q.completedDay : null,
            objectives: q.objectives,
            progress: validProgress,
            state: ['available', 'active', 'completed', 'failed'].includes(q.state) ? q.state : 'active'
          });
          if (out.length >= QUEST.maxQuestsActive) break;
        }
        return out;
      };
      raw.quests = {
        active: validQuest(raw.quests.active),
        completed: validQuest(raw.quests.completed),
        failed: validQuest(raw.quests.failed)
      };
    }

    if (!isPlainObject(raw.achievements)) {
      raw.achievements = { unlocked: [], progress: {} };
    } else {
      const validProgress = {};
      if (isPlainObject(raw.achievements.progress)) {
        for (const [k, v] of Object.entries(raw.achievements.progress)) {
          if (typeof k !== 'string' || !k) continue;
          if (!Number.isFinite(v) || v < 0) continue;
          validProgress[k] = Math.floor(v);
          if (Object.keys(validProgress).length >= ACHIEVEMENT.maxAchievements) break;
        }
      }
      const validUnlocked = [];
      if (Array.isArray(raw.achievements.unlocked)) {
        for (const u of raw.achievements.unlocked) {
          if (!isPlainObject(u)) continue;
          if (typeof u.id !== 'string' || !u.id) continue;
          validUnlocked.push({
            id: u.id,
            unlockedAtDay: Number.isFinite(u.unlockedAtDay) ? Math.floor(u.unlockedAtDay) : null
          });
          if (validUnlocked.length >= ACHIEVEMENT.maxAchievements) break;
        }
      }
      raw.achievements = { unlocked: validUnlocked, progress: validProgress };
    }

    return raw;
  }

  _validateCoord(v) {
    if (!isPlainObject(v)) return null;
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
    return { x: v.x, y: v.y };
  }

  static get VERSION() {
    return CURRENT_VERSION;
  }

  static createWithMemory() {
    return new SaveSystem(new SaveManager(new InMemoryStorage()));
  }
}