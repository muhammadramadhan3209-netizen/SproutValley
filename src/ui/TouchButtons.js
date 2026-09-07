import { TOUCH_SIZE, buttonPosition } from '../config/mobileLayout.js';

export const TOUCH_BUTTON_DEFS = [
  { id: 'quest', label: 'L', sublabel: 'Quest', color: 0xb9a779 },
  { id: 'achievement', label: 'H', sublabel: 'Awards', color: 0x9bd07a },
  { id: 'inventory', label: 'I', sublabel: 'Bag', color: 0x7ec8e8 },
  { id: 'build', label: 'B', sublabel: 'Build', color: 0xffc080 }
];

export const FARM_BUTTON_DEFS = [
  { id: 'hoe', label: 'Q', sublabel: 'Hoe', color: 0xb9a779 },
  { id: 'water', label: 'T', sublabel: 'Water', color: 0x6cc8e8 },
  { id: 'harvest', label: 'Spc', sublabel: 'Pick', color: 0xffd700 },
  { id: 'interact', label: 'E', sublabel: 'Use', color: 0x9bd07a },
  { id: 'shop', label: 'P', sublabel: 'Shop', color: 0xff8866 }
];

export const LAKE_BUTTON_DEFS = [
  { id: 'cast', label: 'F', sublabel: 'Cast', color: 0x6cc8e8 },
  { id: 'catch', label: 'Spc', sublabel: 'Catch', color: 0xffd700 },
  { id: 'interact', label: 'E', sublabel: 'Talk', color: 0x9bd07a }
];

export class TouchButtons {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.onPress = options.onPress || (() => {});
    this.defs = options.defs || TOUCH_BUTTON_DEFS;
    this.rowOffset = options.rowOffset || 0;
    this.top = options.top ?? false;
    this.visible = true;
    this.enabled = true;
    this._buttons = [];
    this._build();
    this._layoutHandler = () => this.layout();
    scene.scale.on('resize', this._layoutHandler);
  }

  _build() {
    const scene = this.scene;
    for (const def of this.defs) {
      const container = scene.add.container(0, 0).setDepth(180).setScrollFactor(0);
      const bg = scene.add.image(0, 0, 'ui_inventory_blocks', 0)
        .setDisplaySize(TOUCH_SIZE + 8, TOUCH_SIZE + 8).setScrollFactor(0);
      // Transparent padding in the original 48px asset is not a smaller hit target.
      const hit = scene.add.rectangle(0, 0, TOUCH_SIZE, TOUCH_SIZE, 0, 0)
        .setScrollFactor(0).setInteractive();
      const label = scene.add.text(0, 0, def.sublabel || def.label, {
        fontSize: '9px', color: '#493724', fontFamily: 'sans-serif', fontStyle: 'bold'
      }).setOrigin(0.5);
      container.add([bg, hit, label]);
      hit.on('pointerdown', (pointer, x, y, event) => {
        event?.stopPropagation();
        if (!this.enabled || !this.visible) return;
        bg.setFrame(1);
        this.onPress(def.id);
      });
      const release = () => bg.setFrame(0);
      hit.on('pointerup', release);
      hit.on('pointerout', release);
      this._buttons.push({ id: def.id, container, bg, hit, label });
    }
    this.layout();
  }

  layout() {
    const { width, height } = this.scene.scale;
    this._buttons.forEach((b, i) => {
      const pos = buttonPosition(i, width, height, { top: this.top, rowOffset: this.rowOffset });
      b.container.setPosition(pos.x, pos.y);
    });
  }
  setVisible(v) {
    this.visible = !!v;
    for (const b of this._buttons) b.container.setVisible(this.visible);
  }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    for (const b of this._buttons) b.container.setAlpha(this.enabled ? 1 : 0.4);
  }
  setBuildHighlight(active) {
    const button = this._buttons.find(b => b.id === 'build');
    if (button) button.bg.setTint(active ? 0xffdc75 : 0xffffff);
  }
  destroy() {
    this.scene.scale.off('resize', this._layoutHandler);
    for (const b of this._buttons) b.container.destroy();
    this._buttons = [];
  }
}
