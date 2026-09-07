import itemsData from '../data/items.json' with { type: 'json' };
import { sheetColumns } from '../config/assetFrames.js';

export class ItemSystem {
  constructor() {
    this.items = itemsData;
    this.byCategory = {
      seed: [],
      crop: [],
      material: [],
      fish: [],
      tool: [],
      decoration: []
    };
    for (const id of Object.keys(this.items)) {
      const item = this.items[id];
      const cat = item.category || 'material';
      if (!this.byCategory[cat]) this.byCategory[cat] = [];
      this.byCategory[cat].push(id);
    }
  }

  get(itemId) {
    return this.items[itemId] || null;
  }

  exists(itemId) {
    return !!this.items[itemId];
  }

  getName(itemId) {
    return this.items[itemId]?.name || itemId;
  }

  getCategory(itemId) {
    return this.items[itemId]?.category || 'material';
  }

  isStackable(itemId) {
    const item = this.items[itemId];
    return item ? item.stackable !== false : true;
  }

  getMaxStack(itemId) {
    const item = this.items[itemId];
    return item?.maxStack ?? 99;
  }

  getIcon(itemId) {
    const item = this.items[itemId];
    if (!item) return null;

    if (item.iconSheet) {
      const frame = item.iconFrame ?? 0;
      const sheet = item.iconSheet;
      const cols = sheetColumns(sheet);
      const col = frame % cols;
      const row = Math.floor(frame / cols);
      return { sheet, col, row, frame };
    }

    return {
      sheet: 'ui_emoji_sheet',
      col: item.iconCol ?? 0,
      row: item.iconRow ?? 0,
      frame: (item.iconRow ?? 0) * sheetColumns('ui_emoji_sheet') + (item.iconCol ?? 0)
    };
  }

  getIconFrame(itemId) {
    const icon = this.getIcon(itemId);
    if (!icon) return null;
    return { col: icon.col, row: icon.row, sheet: icon.sheet, frame: icon.frame };
  }

  getSellPrice(itemId) {
    return this.items[itemId]?.sellPrice ?? 0;
  }

  getBuyPrice(itemId) {
    return this.items[itemId]?.buyPrice ?? 0;
  }

  getNameForSale(itemId) {
    return this.items[itemId]?.name || itemId;
  }

  listSellable() {
    return Object.values(this.items)
      .filter(i => i.sellPrice && i.sellPrice > 0)
      .map(i => i.id);
  }

  listBuyable() {
    return Object.values(this.items)
      .filter(i => i.buyPrice && i.buyPrice > 0)
      .map(i => i.id);
  }

  listByCategory(category) {
    return (this.byCategory[category] || []).slice();
  }

  listAll() {
    return Object.keys(this.items).slice();
  }

  isDecoration(itemId) {
    return this.items[itemId]?.category === 'decoration';
  }

  listDecorations() {
    return (this.byCategory.decoration || []).slice();
  }
}