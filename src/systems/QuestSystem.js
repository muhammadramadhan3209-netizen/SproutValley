import { QUEST, INVENTORY } from '../config/constants.js';
import questData from '../data/quests.json' with { type: 'json' };

export class QuestSystem {
  constructor() {
    this.quests = questData;
    this.active = [];
    this.completed = [];
    this.failed = [];
    this._listeners = new Set();
    this.progressTriggers = new Set();
  }

  static get STATES() {
    return QUEST.states;
  }

  registerProgressTrigger(fn) {
    if (typeof fn !== 'function') return () => {};
    this.progressTriggers.add(fn);
    return () => this.progressTriggers.delete(fn);
  }

  _fireProgress(quest) {
    for (const fn of this.progressTriggers) {
      try { fn(quest); } catch (e) { /* noop */ }
    }
  }

  listAll() {
    return Object.keys(this.quests).slice();
  }

  get(questId) {
    return this.quests[questId] || null;
  }

  getActive() {
    return this.active.slice();
  }

  getCompleted() {
    return this.completed.slice();
  }

  getFailed() {
    return this.failed.slice();
  }

  findById(list, questId) {
    return list.find(q => q.id === questId) || null;
  }

  findActive(questId) {
    return this.findById(this.active, questId);
  }

  isActive(questId) {
    return !!this.findActive(questId);
  }

  isCompleted(questId) {
    return !!this.findById(this.completed, questId);
  }

  isFailed(questId) {
    return !!this.findById(this.failed, questId);
  }

  startQuest(questId) {
    if (!this.quests[questId]) return { ok: false, reason: 'unknown_quest' };
    if (this.isCompleted(questId)) return { ok: false, reason: 'already_completed' };
    if (this.isActive(questId)) return { ok: false, reason: 'already_active' };
    if (this.active.length >= QUEST.maxQuestsActive) {
      return { ok: false, reason: 'limit_reached' };
    }
    const def = this.quests[questId];
    const instance = {
      id: questId,
      startedDay: 1,
      completedDay: null,
      objectives: this._cloneObjectives(def.objectives || {}),
      state: 'active',
      progress: {}
    };
    this.active.push(instance);
    this._notify('start', instance);
    return { ok: true, quest: instance };
  }

  completeQuest(questId) {
    const idx = this.active.findIndex(q => q.id === questId);
    if (idx === -1) return { ok: false, reason: 'not_active' };
    const quest = this.active[idx];
    quest.state = 'completed';
    quest.completedDay = this._currentDay();
    this.active.splice(idx, 1);
    this.completed.push(quest);
    this._notify('complete', quest);
    return { ok: true, quest };
  }

  failQuest(questId) {
    const idx = this.active.findIndex(q => q.id === questId);
    if (idx === -1) return { ok: false, reason: 'not_active' };
    const quest = this.active[idx];
    quest.state = 'failed';
    this.active.splice(idx, 1);
    this.failed.push(quest);
    this._notify('fail', quest);
    return { ok: true, quest };
  }

  reportProgress(type, target, amount = 1) {
    if (!this.active.length) return [];
    const completed = [];
    for (const quest of this.active.slice()) {
      const objectives = quest.objectives || {};
      let changed = false;
      const matchKey = this._matchObjectiveKey(objectives, type, target);
      if (!matchKey) continue;
      const key = matchKey.key;
      const required = matchKey.required;
      const cur = quest.progress[key] || 0;
      const next = Math.min(required, cur + amount);
      if (next !== cur) {
        quest.progress[key] = next;
        changed = true;
      }
      if (next >= required) {
        if (this._isObjectiveComplete(quest, key, required)) {
          if (this._allObjectivesComplete(quest)) {
            const r = this.completeQuest(quest.id);
            if (r.ok) completed.push(r.quest);
          }
        }
      }
      if (changed) this._fireProgress(quest);
    }
    return completed;
  }

  _matchObjectiveKey(objectives, type, target) {
    let fallback = null;
    for (const [key, required] of Object.entries(objectives)) {
      if (!target) {
        if (key === type) {
          return { key, required };
        }
        if (key.startsWith(type + '_')) {
          fallback = { key, required };
        }
      } else {
        if (key === `${type}_${target}`) {
          return { key, required };
        }
        if (key === type) {
          fallback = { key, required };
        }
      }
    }
    return fallback;
  }

  _isObjectiveComplete(quest, key, required) {
    const cur = quest.progress[key] || 0;
    return cur >= required;
  }

  _allObjectivesComplete(quest) {
    const objectives = quest.objectives || {};
    for (const [key, required] of Object.entries(objectives)) {
      if ((quest.progress[key] || 0) < required) return false;
    }
    return true;
  }

  progressFor(questId) {
    const quest = this.findActive(questId);
    if (!quest) return null;
    return {
      id: quest.id,
      objectives: { ...(quest.progress || {}) },
      required: { ...(quest.objectives || {}) },
      isComplete: this._allObjectivesComplete(quest)
    };
  }

  applyReward(questId, economySystem, inventorySystem) {
    const def = this.quests[questId];
    if (!def) return { ok: false, reason: 'unknown_quest' };
    const reward = def.reward || {};
    if (reward.gold && economySystem) {
      economySystem.addGold(reward.gold, `quest:${questId}`);
    }
    if (Array.isArray(reward.items) && inventorySystem) {
      for (const r of reward.items) {
        if (!r || !r.id || !r.quantity) continue;
        inventorySystem.addItem(r.id, r.quantity);
      }
    }
    this._notify('reward', { questId, reward });
    return { ok: true, reward };
  }

  reset() {
    this.active = [];
    this.completed = [];
    this.failed = [];
    this._notify('reset', null);
  }

  snapshot() {
    return {
      active: this._cloneQuestList(this.active),
      completed: this._cloneQuestList(this.completed),
      failed: this._cloneQuestList(this.failed)
    };
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const validate = (list) => Array.isArray(list)
      ? list.filter(q => isPlainObject(q) && typeof q.id === 'string')
      : [];
    const snapActive = validate(snapshot.active);
    const snapCompleted = validate(snapshot.completed);
    const snapFailed = validate(snapshot.failed);
    if (snapActive.length > QUEST.maxQuestsActive) {
      snapActive.length = QUEST.maxQuestsActive;
    }
    this.active = snapActive.map(q => this._cloneQuestInstance(q, 'active'));
    this.completed = snapCompleted.map(q => this._cloneQuestInstance(q, 'completed'));
    this.failed = snapFailed.map(q => this._cloneQuestInstance(q, 'failed'));
    this._notify('restore', null);
    return true;
  }

  _cloneObjectives(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      out[k] = Math.max(1, Math.floor(Number(v) || 0));
    }
    return out;
  }

  _cloneQuestList(list) {
    return list.map(q => this._cloneQuestInstance(q, q.state || 'active'));
  }

  _cloneQuestInstance(q, state) {
    return {
      id: q.id,
      startedDay: Math.max(1, Math.floor(Number(q.startedDay) || 1)),
      completedDay: Number.isFinite(q.completedDay) ? q.completedDay : null,
      objectives: this._cloneObjectives(q.objectives),
      progress: this._cloneObjectives(q.progress),
      state: QUEST.states.includes(state) ? state : 'active'
    };
  }

  _currentDay() {
    return Date.now();
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

  get INVENTORY() {
    return INVENTORY;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}