const STORAGE_PREFIX = 'sproutvalley_';

function defaultStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

export class SaveManager {
  constructor(storage = null) {
    this.storage = storage ?? defaultStorage();
    this.available = this.storage !== null;
  }

  isAvailable() {
    return this.available;
  }

  save(key, data) {
    if (!this.available) return false;
    try {
      const payload = JSON.stringify(data);
      this.storage.setItem(STORAGE_PREFIX + key, payload);
      return true;
    } catch (err) {
      console.warn('[SaveManager] save failed for', key, err.message);
      return false;
    }
  }

  load(key) {
    if (!this.available) return null;
    try {
      const raw = this.storage.getItem(STORAGE_PREFIX + key);
      if (raw === null || raw === undefined) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[SaveManager] load failed for', key, err.message);
      return null;
    }
  }

  remove(key) {
    if (!this.available) return false;
    try {
      this.storage.removeItem(STORAGE_PREFIX + key);
      return true;
    } catch (err) {
      console.warn('[SaveManager] remove failed for', key, err.message);
      return false;
    }
  }

  clear() {
    if (!this.available) return false;
    try {
      const keys = [];
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
      }
      for (const k of keys) this.storage.removeItem(k);
      return true;
    } catch (err) {
      console.warn('[SaveManager] clear failed', err.message);
      return false;
    }
  }

  has(key) {
    if (!this.available) return false;
    try {
      return this.storage.getItem(STORAGE_PREFIX + key) !== null;
    } catch (err) {
      return false;
    }
  }
}

export class InMemoryStorage {
  constructor() {
    this._store = new Map();
  }

  get length() {
    return this._store.size;
  }

  key(i) {
    return Array.from(this._store.keys())[i] ?? null;
  }

  getItem(k) {
    return this._store.has(k) ? this._store.get(k) : null;
  }

  setItem(k, v) {
    this._store.set(k, String(v));
  }

  removeItem(k) {
    this._store.delete(k);
  }

  clear() {
    this._store.clear();
  }
}

export const SAVE_KEYS = {
  GAME: 'game_v1'
};