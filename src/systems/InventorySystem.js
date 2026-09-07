import { INVENTORY } from '../config/constants.js';

export class InventorySystem {
  constructor(itemSystem = null) {
    this.capacity = INVENTORY.capacity;
    this.slots = new Array(this.capacity).fill(null);
    this.activeSlot = INVENTORY.defaultSelectedSlot;
    this.history = [];
    this.itemSystem = itemSystem;
  }

  getSlotCount() {
    return this.capacity;
  }

  getActiveSlot() {
    return this.activeSlot;
  }

  setActiveSlot(idx, silent = false) {
    if (idx >= 0 && idx < this.capacity) {
      this.activeSlot = idx;
      if (!silent) this._log('select', this.getActiveItem(), 0);
      return true;
    }
    return false;
  }

  cycleActiveSlot(direction = 1) {
    const next = (this.activeSlot + direction + this.capacity) % this.capacity;
    return this.setActiveSlot(next, true);
  }

  getActiveItem() {
    const slot = this.slots[this.activeSlot];
    return slot ? slot.itemId : null;
  }

  getSlot(idx) {
    return this.slots[idx] ? { ...this.slots[idx] } : null;
  }

  getAllSlots() {
    return this.slots.map(s => (s ? { ...s } : null));
  }

  getAll() {
    const totals = {};
    for (const s of this.slots) {
      if (s) totals[s.itemId] = (totals[s.itemId] || 0) + s.quantity;
    }
    return totals;
  }

  countItem(itemId) {
    let total = 0;
    for (const s of this.slots) {
      if (s && s.itemId === itemId) total += s.quantity;
    }
    return total;
  }

  hasItem(itemId, quantity = 1) {
    return this.countItem(itemId) >= quantity;
  }

  _findSlotWithItem(itemId, startFrom = 0, allowPartial = true) {
    for (let i = startFrom; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      if (s.itemId !== itemId) continue;
      if (allowPartial || s.quantity > 0) return i;
    }
    return -1;
  }

  _findEmptySlot() {
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) return i;
    }
    return -1;
  }

  addItem(itemId, quantity = 1, maxStack = null) {
    if (!itemId || quantity <= 0) return 0;

    const stackLimit = maxStack ?? this._resolveMaxStack(itemId);
    let remaining = quantity;

    if (this._isStackable(itemId)) {
      const visited = new Set();
      let idx = this._findSlotWithItem(itemId);
      while (idx !== -1 && remaining > 0) {
        if (visited.has(idx)) break;
        visited.add(idx);
        const s = this.slots[idx];
        const space = stackLimit - s.quantity;
        if (space > 0) {
          const take = Math.min(space, remaining);
          s.quantity += take;
          remaining -= take;
        }
        if (s.quantity >= stackLimit) {
          idx = this._findSlotWithItem(itemId, idx + 1);
        } else {
          idx = this._findSlotWithItem(itemId);
        }
      }
    }

    while (remaining > 0) {
      const empty = this._findEmptySlot();
      if (empty === -1) break;
      const take = Math.min(stackLimit, remaining);
      this.slots[empty] = { itemId, quantity: take };
      remaining -= take;
    }

    const added = quantity - remaining;
    if (added > 0) {
      this._log('add', itemId, added);
      this._dump();
    }
    if (remaining > 0) {
      console.warn(`[Inventory] cannot fit ${remaining}x ${itemId}, inventory full`);
    }
    return added;
  }

  _resolveMaxStack(itemId) {
    if (this.itemSystem?.getMaxStack) {
      const v = this.itemSystem.getMaxStack(itemId);
      if (typeof v === 'number' && v > 0) return v;
    }
    return 99;
  }

  removeItem(itemId, quantity = 1) {
    if (!itemId || quantity <= 0) return 0;

    let remaining = quantity;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const s = this.slots[i];
      if (!s || s.itemId !== itemId) continue;
      const take = Math.min(s.quantity, remaining);
      s.quantity -= take;
      remaining -= take;
      if (s.quantity <= 0) this.slots[i] = null;
    }

    const removed = quantity - remaining;
    if (removed > 0) {
      this._log('remove', itemId, removed);
      this._dump();
    }
    return removed;
  }

  consumeActive(quantity = 1) {
    const itemId = this.getActiveItem();
    if (!itemId) return false;
    if (!this.hasItem(itemId, quantity)) return false;
    this.removeItem(itemId, quantity);
    return true;
  }

  _isStackable(itemId) {
    return true;
  }

  clear() {
    this.slots = new Array(this.capacity).fill(null);
    this._log('clear', null, 0);
  }

  _log(action, itemId, quantity) {
    this.history.push({ action, itemId, quantity, at: Date.now() });
    if (this.history.length > 50) this.history.shift();
  }

  _dump() {
  }
}