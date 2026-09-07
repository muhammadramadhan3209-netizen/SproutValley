import { ECONOMY } from '../config/constants.js';

export class EconomySystem {
  constructor(itemSystem = null) {
    this.itemSystem = itemSystem;
    this.gold = ECONOMY.startingGold;
    this.totalEarned = 0;
    this.totalSpent = 0;
    this.transactions = 0;
    this._listeners = new Set();
  }

  static get MAX_GOLD() {
    return ECONOMY.maxGold;
  }

  getGold() {
    return this.gold;
  }

  getTotalEarned() {
    return this.totalEarned;
  }

  getTotalSpent() {
    return this.totalSpent;
  }

  getTransactions() {
    return this.transactions;
  }

  setItemSystem(itemSystem) {
    this.itemSystem = itemSystem;
  }

  canAfford(amount) {
    if (!Number.isFinite(amount) || amount < 0) return false;
    return this.gold >= amount;
  }

  addGold(amount, reason = 'unspecified') {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const space = ECONOMY.maxGold - this.gold;
    const credit = Math.min(amount, space);
    this.gold += credit;
    this.totalEarned += credit;
    this.transactions += 1;
    this._notify('earn', { amount: credit, reason });
    return credit;
  }

  spendGold(amount, reason = 'unspecified') {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    if (this.gold < amount) {
      this._notify('fail', { amount, reason: 'insufficient_funds' });
      return { ok: false, reason: 'insufficient_funds' };
    }
    this.gold -= amount;
    this.totalSpent += amount;
    this.transactions += 1;
    this._notify('spend', { amount, reason });
    return { ok: true, amount };
  }

  sellItem(itemId, quantity, inventorySystem) {
    if (!itemId || !inventorySystem) return { ok: false, reason: 'invalid_input' };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: 'invalid_quantity' };
    if (!this.itemSystem) return { ok: false, reason: 'no_item_system' };

    const def = this.itemSystem.get(itemId);
    if (!def) return { ok: false, reason: 'unknown_item' };
    if (!ECONOMY.sellableCategories.includes(def.category)) {
      return { ok: false, reason: 'not_sellable' };
    }
    const priceEach = this.itemSystem.getSellPrice(itemId) * ECONOMY.sellPriceMultiplier;
    if (priceEach <= 0) return { ok: false, reason: 'no_price' };

    if (!inventorySystem.hasItem(itemId, quantity)) {
      return { ok: false, reason: 'insufficient_stock' };
    }
    inventorySystem.removeItem(itemId, quantity);
    const total = Math.floor(priceEach * quantity);
    const credit = this.addGold(total, `sell:${itemId}x${quantity}`);
    return { ok: true, itemId, quantity, total, credit };
  }

  buyItem(itemId, quantity, inventorySystem) {
    if (!itemId || !inventorySystem) return { ok: false, reason: 'invalid_input' };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: 'invalid_quantity' };
    if (!this.itemSystem) return { ok: false, reason: 'no_item_system' };

    const def = this.itemSystem.get(itemId);
    if (!def) return { ok: false, reason: 'unknown_item' };
    if (!ECONOMY.categories.includes(def.category)) {
      return { ok: false, reason: 'not_purchasable' };
    }
    const priceEach = this.itemSystem.getBuyPrice(itemId) * ECONOMY.buyPriceMultiplier;
    if (priceEach <= 0) return { ok: false, reason: 'no_price' };

    const total = Math.floor(priceEach * quantity);
    const spend = this.spendGold(total, `buy:${itemId}x${quantity}`);
    if (!spend.ok) return spend;

    const added = inventorySystem.addItem(itemId, quantity, def.maxStack || 99);
    if (added < quantity) {
      const refundQty = quantity - added;
      const refundAmt = Math.floor(priceEach * refundQty);
      this.addGold(refundAmt, `refund:${itemId}x${refundQty}`);
      return { ok: false, reason: 'inventory_full', added, refund: refundAmt };
    }
    return { ok: true, itemId, quantity, total, cost: total };
  }

  snapshot() {
    return {
      gold: this.gold,
      totalEarned: this.totalEarned,
      totalSpent: this.totalSpent,
      transactions: this.transactions
    };
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (Number.isFinite(snapshot.gold)) {
      this.gold = Math.max(0, Math.min(ECONOMY.maxGold, Math.floor(snapshot.gold)));
    }
    if (Number.isFinite(snapshot.totalEarned)) {
      this.totalEarned = Math.max(0, Math.floor(snapshot.totalEarned));
    }
    if (Number.isFinite(snapshot.totalSpent)) {
      this.totalSpent = Math.max(0, Math.floor(snapshot.totalSpent));
    }
    if (Number.isFinite(snapshot.transactions)) {
      this.transactions = Math.max(0, Math.floor(snapshot.transactions));
    }
    this._notify('restore');
    return true;
  }

  reset() {
    this.gold = ECONOMY.startingGold;
    this.totalEarned = 0;
    this.totalSpent = 0;
    this.transactions = 0;
    this._notify('reset');
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