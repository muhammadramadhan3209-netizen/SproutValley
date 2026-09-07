import { SCENE_KEYS, COLORS } from '../config/constants.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { TimeSystem } from '../systems/TimeSystem.js';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.MAIN_MENU });
  }

  create() {
    this._starting = false;
    const { width, height } = this.scale;

    if (this.game.registry.has('__sproutValleyTime')) {
      const ts = this.game.registry.get('__sproutValleyTime');
      if (ts && typeof ts.pause === 'function') ts.pause();
    }

    this.cameras.main.setBackgroundColor(COLORS.background);

    this.add
      .text(width / 2, height / 2 - 28, 'Sprout Valley', {
        fontSize: '22px',
        color: '#ffffff',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 4, 'A cozy farming sandbox', {
        fontSize: '11px',
        color: '#cccccc',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 22, 'Press ENTER or TAP to play', {
        fontSize: '11px',
        color: '#9bd07a',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5);

    const saveSystem = new SaveSystem();
    const hasSave = saveSystem.hasSave();
    this.add
      .text(width / 2, height / 2 + 42, hasSave ? '[continue save]' : '[new game]', {
        fontSize: '9px',
        color: hasSave ? '#ffd700' : '#777777',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5);

    if (hasSave) {
      this.add
        .text(width / 2, height / 2 + 58, '[D] clear save', {
          fontSize: '8px',
          color: '#aa6655',
          fontFamily: 'monospace'
        })
        .setOrigin(0.5);
      this.input.keyboard.once('keydown-D', () => {
        saveSystem.clearSave();
        if (this.game.registry.has('__sproutValleyTime')) {
          const ts = this.game.registry.get('__sproutValleyTime');
          if (ts && typeof ts.reset === 'function') ts.reset();
        }
        if (this.sys.settings.data) this.sys.settings.data.cleared = true;
        this.scene.restart();
      });
    }

    this.add
      .text(width / 2, height - 8, 'v1.1.0 - Sprout Valley', {
        fontSize: '9px',
        color: '#777777',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5);

    const anchors = this.children.list.map(child => ({ child, offsetY: child.y - height / 2,
      footer: child.y === height - 8 }));
    const layout = () => anchors.forEach(({ child, offsetY, footer }) => {
      child.setPosition(this.scale.width / 2, footer ? this.scale.height - 8 : this.scale.height / 2 + offsetY);
    });
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => this.scale.off('resize', layout));

    this.input.keyboard.once('keydown-ENTER', () => this.startFarm());
    this.input.keyboard.once('keydown-SPACE', () => this.startFarm());
    this.input.once('pointerdown', () => this.startFarm());
  }

  startFarm() {
    if (this._starting) return;
    this._starting = true;
    if (this.game.registry.has('__sproutValleyTime')) {
      const ts = this.game.registry.get('__sproutValleyTime');
      if (ts && typeof ts.resume === 'function') ts.resume();
    }
    this.scene.start(SCENE_KEYS.FARM);
  }
}