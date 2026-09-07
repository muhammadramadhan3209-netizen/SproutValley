import { addCloseButton } from './sceneLayout.js';
import { INVENTORY } from '../config/constants.js';

export class InventoryUI {
  constructor(scene, inventorySystem, itemSystem) {
    this.scene = scene;
    this.inventory = inventorySystem;
    this.items = itemSystem;
    this.visible = false;
    this.container = null;
    this.slotSprites = [];
    this.iconSprites = [];
    this.quantityTexts = [];
    this.activeMarker = null;
    this.titleText = null;
    this.hintText = null;
    this._build();
  }

  _build() {
    const scene = this.scene;
    const { cols, rows, slotSize, slotPadding, panelPadding } = INVENTORY;

    const gridW = cols * slotSize + (cols - 1) * slotPadding;
    const gridH = rows * slotSize + (rows - 1) * slotPadding;
    const panelW = gridW + panelPadding * 2;
    const panelH = gridH + panelPadding * 2 + 56;
    this.panelHeight = panelH;

    const cam = scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    this.container = scene.add.container(cx, cy).setDepth(200).setScrollFactor(0);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(0, 0, panelW, panelH, 0x2a1f12, 0.92);
    bg.setStrokeStyle(2, 0xb9a779, 1);
    bg.setOrigin(0.5);
    this.container.add(bg);

    const header = scene.add.image(0, -panelH / 2 + 4, 'ui_inventory_blocks', 8);
    header.setDisplaySize(panelW - 8, 20);
    header.setOrigin(0.5, 0);
    this.container.add(header);

    this.titleText = scene.add.text(0, -panelH / 2 + 20, 'INVENTORY', {
      fontSize: '10px',
      color: '#ffeebb',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 0);
    this.container.add(this.titleText);

    const gridX = -gridW / 2;
    const gridY = -panelH / 2 + 42;

    for (let r = 0; r < rows; r++) {
      this.slotSprites[r] = [];
      this.iconSprites[r] = [];
      this.quantityTexts[r] = [];
      for (let c = 0; c < cols; c++) {
        const x = gridX + c * (slotSize + slotPadding);
        const y = gridY + r * (slotSize + slotPadding);

        const slotBg = scene.add.image(x + slotSize / 2, y + slotSize / 2, 'ui_inventory_blocks', 4);
        slotBg.setDisplaySize(slotSize + 2, slotSize + 2);
        slotBg.setOrigin(0.5);
        slotBg.setScrollFactor(0).setInteractive();
        slotBg.on('pointerdown', (pointer, x, y, event) => {
          event?.stopPropagation();
          this.inventory.setActiveSlot(r * cols + c);
          this.refresh();
        });
        this.container.add(slotBg);
        this.slotSprites[r][c] = slotBg;

        const iconHolder = scene.add.image(x + slotSize / 2, y + slotSize / 2, 'ui_emoji_sheet', 0);
        iconHolder.setDisplaySize(slotSize - 2, slotSize - 2);
        iconHolder.setOrigin(0.5);
        iconHolder.setVisible(false);
        this.container.add(iconHolder);
        this.iconSprites[r][c] = iconHolder;

        const qty = scene.add.text(
          x + slotSize - 1,
          y + slotSize - 1,
          '',
          {
            fontSize: '7px',
            color: '#ffffff',
            fontFamily: 'monospace',
            stroke: '#000000',
            strokeThickness: 2
          }
        ).setOrigin(1, 1);
        qty.setVisible(false);
        this.container.add(qty);
        this.quantityTexts[r][c] = qty;
      }
    }

    this.activeMarker = scene.add.graphics();
    this.activeMarker.lineStyle(2, 0xfff066, 1);
    this.activeMarker.strokeRect(-999, -999, slotSize + 4, slotSize + 4);
    this.container.add(this.activeMarker);

    this.hintText = scene.add.text(0, panelH / 2 - 4, 'Tap a slot to select', {
      fontSize: '8px',
      color: '#cccccc',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 1);
    this.container.add(this.hintText);
    addCloseButton(scene, this.container, panelW, panelH, () => this.hide());

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
    const { cols, rows, slotSize, slotPadding } = INVENTORY;
    const slots = this.inventory.getAllSlots();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const data = slots[idx];
        const iconHolder = this.iconSprites[r][c];
        const qtyText = this.quantityTexts[r][c];
        if (!data) {
          iconHolder.setVisible(false);
          qtyText.setVisible(false);
          continue;
        }
        const def = this.items.get(data.itemId);
        if (def) {
          const icon = this.items.getIcon(data.itemId);
          iconHolder.setTexture(icon.sheet, icon.frame);
          iconHolder.setDisplaySize(slotSize - 4, slotSize - 4);
          iconHolder.setVisible(true);
        } else {
          iconHolder.setVisible(false);
        }
        if (data.quantity > 1) {
          qtyText.setText(String(data.quantity));
          qtyText.setVisible(true);
        } else {
          qtyText.setVisible(false);
        }
      }
    }

    const activeIdx = this.inventory.getActiveSlot();
    const ar2 = Math.floor(activeIdx / cols);
    const ac = activeIdx % cols;
    const gridX = -((cols * slotSize + (cols - 1) * slotPadding)) / 2;
    const gridY = -this.panelHeight / 2 + 42;
    const ax = gridX + ac * (slotSize + slotPadding);
    const ay = gridY + ar2 * (slotSize + slotPadding);
    this.activeMarker.clear();
    this.activeMarker.lineStyle(2, 0xfff066, 1);
    this.activeMarker.strokeRect(ax - 2, ay - 2, slotSize + 4, slotSize + 4);
  }
}