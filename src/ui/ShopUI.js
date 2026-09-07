import { addCloseButton } from './sceneLayout.js';
import { ECONOMY, INVENTORY } from '../config/constants.js';

export class ShopUI {
  constructor(scene, economySystem, inventorySystem, itemSystem) {
    this.scene = scene;
    this.economy = economySystem;
    this.inventory = inventorySystem;
    this.items = itemSystem;
    this.visible = false;
    this.mode = 'buy';
    this.selectedIndex = 0;
    this._list = [];
    this._build();
  }

  _build() {
    const scene = this.scene;
    const cam = scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const panelW = 240;
    const panelH = 200;
    this.panelHeight = panelH;

    this.container = scene.add.container(cx, cy).setDepth(200).setScrollFactor(0);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(0, 0, panelW, panelH, 0x1f1a12, 0.96);
    bg.setStrokeStyle(2, 0xb9a779, 1);
    bg.setOrigin(0.5);
    this.container.add(bg);

    this.titleText = scene.add.text(0, -panelH / 2 + 10, 'SHOP', {
      fontSize: '11px', color: '#ffeebb', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5);
    this.container.add(this.titleText);

    this.modeText = scene.add.text(0, -panelH / 2 + 26, '', {
      fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    this.container.add(this.modeText);

    this.goldText = scene.add.text(0, -47, 'Gold: 0', {
      fontSize: '10px', color: '#ffd700', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    this.container.add(this.goldText);

    this.listContainer = scene.add.container(0, -30);
    this.container.add(this.listContainer);

    this.detailText = scene.add.text(0, 50, '', {
      fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
      align: 'center',
      wordWrap: { width: panelW - 16 }
    }).setOrigin(0.5);
    this.container.add(this.detailText);

    this.hintText = scene.add.text(0, panelH / 2 - 8, '', {
      fontSize: '7px', color: '#888888', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    this.container.add(this.hintText);
    addCloseButton(scene, this.container, panelW, panelH, () => this.hide());
    const touch = (x, y, w, label, callback) => {
      const hit = scene.add.rectangle(x, y, w, 28, 0x6f5840, 1).setScrollFactor(0).setInteractive();
      const text = scene.add.text(x, y, label, { fontSize: '10px', color: '#fff3d8', fontFamily: 'sans-serif' }).setOrigin(0.5);
      hit.on('pointerdown', (pointer, localX, localY, event) => { event?.stopPropagation(); callback(); });
      this.container.add([hit, text]);
    };
    touch(-36, -70, 64, 'Buy', () => this.setMode('buy'));
    touch(36, -70, 64, 'Sell', () => this.setMode('sell'));
    touch(-94, 81, 36, '<', () => this.moveSelection(-1));
    touch(94, 81, 36, '>', () => this.moveSelection(1));
    touch(0, 81, 100, 'Confirm', () => {
      const result = this.confirmAction();
      if (result && !result.ok) scene._showShopMessage(scene._shopMessageFor(result.reason));
      scene._refreshHUD();
    });

    this.refresh();
  }

  setMode(mode) {
    if (mode !== 'buy' && mode !== 'sell') return;
    this.mode = mode;
    this.selectedIndex = 0;
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
    if (!this.container) return;
    if (this.mode === 'buy') {
      this._list = this.items.listBuyable();
    } else {
      const owned = [];
      for (const id of this.items.listAll()) {
        if (this.inventory.countItem(id) > 0) {
          const def = this.items.get(id);
          if (def && ECONOMY.sellableCategories.includes(def.category)) {
            owned.push(id);
          }
        }
      }
      this._list = owned;
    }
    if (this.selectedIndex >= this._list.length) this.selectedIndex = 0;

    this.listContainer.removeAll(true);
    const startY = 0;
    const rowH = 22;
    const first = Math.floor(this.selectedIndex / 3) * 3;
    const max = Math.min(this._list.length - first, 3);
    for (let i = 0; i < max; i++) {
      const index = first + i;
      const id = this._list[index];
      const def = this.items.get(id);
      if (!def) continue;
      const isSel = index === this.selectedIndex;
      const color = isSel ? '#ffd700' : '#ffffff';
      const price = this.mode === 'buy'
        ? this.items.getBuyPrice(id)
        : this.items.getSellPrice(id);
      const owned = this.inventory.countItem(id);
      const label = `${isSel ? '>' : ' '} ${def.name}  ${price}g  (${owned})`;
      const t = this.scene.add.text(0, startY + i * rowH, label, {
        fontSize: '8px',
        color,
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 0);
      const hit = this.scene.add.rectangle(0, startY + i * rowH + 7, 220, rowH, 0, 0)
        .setScrollFactor(0).setInteractive();
      hit.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation(); this.selectedIndex = index; this.refresh();
      });
      this.listContainer.add([t, hit]);
    }
    if (this._list.length === 0) {
      const t = this.scene.add.text(0, 0, this.mode === 'buy' ? 'Nothing to buy' : 'Nothing to sell', {
        fontSize: '9px', color: '#888888', fontFamily: 'monospace',
        stroke: '#000000', strokeThickness: 2
      }).setOrigin(0.5);
      this.listContainer.add(t);
    }

    this.goldText.setText(`Gold: ${this.economy.getGold()}g`);

    const cur = this._list[this.selectedIndex];
    if (cur) {
      const def = this.items.get(cur);
      this.detailText.setText(def?.description || '');
    } else {
      this.detailText.setText(this.mode === 'buy' ? 'Visit other places to earn gold' : 'Catch fish or harvest crops to sell');
    }
  }

  moveSelection(delta) {
    if (this._list.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this._list.length) % this._list.length;
    this.refresh();
  }

  confirmAction() {
    const id = this._list[this.selectedIndex];
    if (!id) return null;
    if (this.mode === 'buy') {
      const r = this.economy.buyItem(id, 1, this.inventory);
      this.refresh();
      return r;
    }
    const r = this.economy.sellItem(id, 1, this.inventory);
    this.refresh();
    return r;
  }
}