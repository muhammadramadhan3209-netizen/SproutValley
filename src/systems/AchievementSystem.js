import { ACHIEVEMENT } from '../config/constants.js';
import achievementData from '../data/achievements.json' with { type: 'json' };

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function defaultAchievements() {
  return {
    unlocked: [],
    progress: {}
  };
}

export class AchievementSystem {
  constructor() {
    this.achievements = achievementData;
    this.unlocked = [];
    this.progress = {};
    this._listeners = new Set();
  }

  listAll() {
    return Object.keys(this.achievements).slice();
  }

  get(id) {
    return this.achievements[id] || null;
  }

  getUnlocked() {
    return this.unlocked.slice();
  }

  isUnlocked(id) {
    return this.unlocked.some(u => u.id === id);
  }

  findUnlocked(id) {
    return this.unlocked.find(u => u.id === id) || null;
  }

  progressFor(id) {
    const def = this.achievements[id];
    if (!def) return null;
    const cur = this.progress[id] || 0;
    return {
      id,
      progress: cur,
      target: def.target,
      isComplete: this.isUnlocked(id) || cur >= def.target,
      percent: def.target > 0 ? Math.min(1, cur / def.target) : 0
    };
  }

  reportProgress(type, target = null, amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const newly = [];
    for (const def of Object.values(this.achievements)) {
      if (!def || def.trigger !== type) continue;
      if (this.isUnlocked(def.id)) continue;
      if (!this._matchesTarget(def, target)) continue;

      const cur = this.progress[def.id] || 0;
      const next = Math.min(def.target, cur + amount);
      this.progress[def.id] = next;

      if (next >= def.target) {
        const record = { id: def.id, unlockedAtDay: this._currentDay() };
        this.unlocked.push(record);
        this._notify('unlock', { achievement: def, record });
        newly.push(def);
      } else {
        this._notify('progress', { achievement: def, progress: next, target: def.target });
      }
    }
    return newly;
  }

  _matchesTarget(def, target) {
    if (def.targetId === null || def.targetId === undefined) return true;
    if (target === null || target === undefined) return false;
    return def.targetId === target;
  }

  applyReward(id, economySystem, inventorySystem) {
    const def = this.achievements[id];
    if (!def) return { ok: false, reason: 'unknown_achievement' };
    if (!this.isUnlocked(id)) return { ok: false, reason: 'not_unlocked' };
    const reward = def.reward || {};
    if (reward.gold && economySystem) {
      economySystem.addGold(reward.gold, `achievement:${id}`);
    }
    if (Array.isArray(reward.items) && inventorySystem) {
      for (const r of reward.items) {
        if (!r || !r.id || !r.quantity) continue;
        inventorySystem.addItem(r.id, r.quantity);
      }
    }
    this._notify('reward', { id, reward });
    return { ok: true, reward };
  }

  unlock(id) {
    if (!this.achievements[id]) return { ok: false, reason: 'unknown_achievement' };
    if (this.isUnlocked(id)) return { ok: false, reason: 'already_unlocked' };
    const record = { id, unlockedAtDay: this._currentDay() };
    this.unlocked.push(record);
    this.progress[id] = this.achievements[id].target;
    this._notify('unlock', { achievement: this.achievements[id], record });
    return { ok: true, record };
  }

  reset() {
    this.unlocked = [];
    this.progress = {};
    this._notify('reset', null);
  }

  snapshot() {
    const progress = {};
    for (const [k, v] of Object.entries(this.progress)) {
      if (typeof k !== 'string' || !Number.isFinite(v) || v < 0) continue;
      progress[k] = Math.floor(v);
    }
    const unlocked = this.unlocked
      .filter(u => u && typeof u.id === 'string')
      .map(u => ({
        id: u.id,
        unlockedAtDay: Number.isFinite(u.unlockedAtDay) ? Math.floor(u.unlockedAtDay) : null
      }));
    return { unlocked, progress };
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const validProgress = {};
    if (isPlainObject(snapshot.progress)) {
      for (const [k, v] of Object.entries(snapshot.progress)) {
        if (typeof k !== 'string' || !k) continue;
        if (!Number.isFinite(v) || v < 0) continue;
        validProgress[k] = Math.floor(v);
        if (Object.keys(validProgress).length >= ACHIEVEMENT.maxAchievements) break;
      }
    }
    const validUnlocked = [];
    if (Array.isArray(snapshot.unlocked)) {
      for (const u of snapshot.unlocked) {
        if (!isPlainObject(u) || typeof u.id !== 'string' || !u.id) continue;
        if (!this.achievements[u.id]) continue;
        validUnlocked.push({
          id: u.id,
          unlockedAtDay: Number.isFinite(u.unlockedAtDay) ? Math.floor(u.unlockedAtDay) : null
        });
        if (validUnlocked.length >= ACHIEVEMENT.maxAchievements) break;
      }
    }
    this.progress = validProgress;
    this.unlocked = validUnlocked;
    this._notify('restore', null);
    return true;
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _currentDay() {
    return Date.now();
  }

  _notify(event, data = null) {
    for (const fn of this._listeners) {
      try { fn(event, data); } catch (e) { /* noop */ }
    }
  }

  static defaultSnapshot() {
    return defaultAchievements();
  }
}