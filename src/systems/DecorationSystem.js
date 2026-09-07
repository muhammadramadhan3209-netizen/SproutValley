import { TILE_SIZE, DECORATION } from '../config/constants.js';

export class DecorationSystem {
  constructor(scene, itemSystem, inventorySystem, options = {}) {
    this.scene = scene;
    this.itemSystem = itemSystem;
    this.inventory = inventorySystem;
    this.maxDecorations = options.maxDecorations ?? DECORATION.maxDecorations;
    this.decorations = [];
    this.sprites = [];
    this._listeners = new Set();
  }

  isInPlotArea(x, y) {
    const area = DECORATION.invalidTileStates;
    return area.length > 0 && false;
  }

  isValidPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || y < 0) return false;
    return true;
  }

  isOccupied(x, y) {
    for (const d of this.decorations) {
      if (d.x === x && d.y === y) return true;
    }
    return false;
  }

  place(itemId, x, y) {
    if (!itemId) return { ok: false, reason: 'invalid_item' };
    if (!this.itemSystem || !this.itemSystem.exists(itemId)) {
      return { ok: false, reason: 'unknown_item' };
    }
    if (!this.itemSystem.isDecoration(itemId)) {
      return { ok: false, reason: 'not_decoration' };
    }
    if (!this.isValidPosition(x, y)) {
      return { ok: false, reason: 'invalid_position' };
    }
    if (this.isOccupied(x, y)) {
      return { ok: false, reason: 'occupied' };
    }
    if (this.decorations.length >= this.maxDecorations) {
      return { ok: false, reason: 'limit_reached' };
    }
    if (this.inventory && !this.inventory.hasItem(itemId, 1)) {
      return { ok: false, reason: 'no_item' };
    }
    if (this.inventory) this.inventory.removeItem(itemId, 1);

    const dec = { id: itemId, x, y };
    this.decorations.push(dec);
    const sprite = this._createSprite(dec);
    this.sprites.push(sprite);
    this._notify('place', dec);
    return { ok: true, decoration: dec, sprite };
  }

  remove(x, y) {
    const idx = this.decorations.findIndex(d => d.x === x && d.y === y);
    if (idx === -1) return { ok: false, reason: 'not_found' };
    const dec = this.decorations[idx];
    this.decorations.splice(idx, 1);
    const sprite = this.sprites[idx];
    this.sprites.splice(idx, 1);
    if (sprite && sprite.destroy) sprite.destroy();
    if (this.inventory) this.inventory.addItem(dec.id, 1);
    this._notify('remove', dec);
    return { ok: true, decoration: dec };
  }

  removeByIndex(index) {
    if (index < 0 || index >= this.decorations.length) return { ok: false, reason: 'invalid_index' };
    const dec = this.decorations[index];
    return this.remove(dec.x, dec.y);
  }

  clear() {
    const removed = this.decorations.slice();
    this.decorations = [];
    for (const s of this.sprites) {
      if (s && s.destroy) s.destroy();
    }
    this.sprites = [];
    if (this.inventory) {
      for (const d of removed) {
        this.inventory.addItem(d.id, 1);
      }
    }
    this._notify('clear', removed);
    return removed;
  }

  getAt(x, y) {
    return this.decorations.find(d => d.x === x && d.y === y) || null;
  }

  count() {
    return this.decorations.length;
  }

  list() {
    return this.decorations.slice();
  }

  snapToGrid(x, y) {
    return {
      x: Math.floor(x / TILE_SIZE) * TILE_SIZE,
      y: Math.floor(y / TILE_SIZE) * TILE_SIZE
    };
  }

  snapTileToGrid(tx, ty) {
    return { x: tx * TILE_SIZE, y: ty * TILE_SIZE };
  }

  worldToTile(x, y) {
    return { tx: Math.floor(x / TILE_SIZE), ty: Math.floor(y / TILE_SIZE) };
  }

  tileToWorld(tx, ty) {
    return { x: tx * TILE_SIZE, y: ty * TILE_SIZE };
  }

  _createSprite(dec) {
    if (!this.scene || !this.scene.add) return null;
    const def = this.itemSystem?.get(dec.id);
    if (!def) return null;
    const icon = this.itemSystem.getIcon(dec.id);
    if (!icon) return null;
    const sprite = this.scene.add.image(dec.x, dec.y, icon.sheet, icon.frame);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(DECORATION.defaultDisplaySize, DECORATION.defaultDisplaySize);
    sprite.setDepth(6);
    return sprite;
  }

  rebuildSprites() {
    for (const s of this.sprites) {
      if (s && s.destroy) s.destroy();
    }
    this.sprites = [];
    for (const dec of this.decorations) {
      const sprite = this._createSprite(dec);
      if (sprite) this.sprites.push(sprite);
    }
  }

  snapshot() {
    return this.decorations.map(d => ({ id: d.id, x: d.x, y: d.y }));
  }

  restore(snapshot) {
    if (!Array.isArray(snapshot)) return false;
    for (const s of this.sprites) {
      if (s && s.destroy) s.destroy();
    }
    this.decorations = [];
    this.sprites = [];
    let restored = 0;
    for (const d of snapshot) {
      if (!d || typeof d.id !== 'string' || !Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      if (this.decorations.length >= this.maxDecorations) break;
      const dec = { id: d.id, x: Math.floor(d.x), y: Math.floor(d.y) };
      this.decorations.push(dec);
      const sprite = this._createSprite(dec);
      if (sprite) this.sprites.push(sprite);
      restored++;
    }
    this._notify('restore', { count: restored });
    return true;
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(event, data = null) {
    for (const fn of this._listeners) {
      try { fn(event, data); } catch (e) { /* noop */ }
    }
  }
}