import { SCENE_KEYS, COLORS, ASSET_PATHS } from '../config/constants.js';
import { SHEETS } from '../config/assetFrames.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.PRELOAD });
  }

  preload() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.cameras.main.setBackgroundColor(COLORS.background);

    this.add
      .text(cx, cy, 'Loading...', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5);

    const paths = {
      tileset_grass: ASSET_PATHS.tilesets.grass,
      tileset_dirt: ASSET_PATHS.tilesets.dirt,
      tileset_water: ASSET_PATHS.tilesets.water,
      object_house: ASSET_PATHS.objects.house,
      player: ASSET_PATHS.characters.player,
      plants_dry: ASSET_PATHS.farming.plants,
      plants_watered: ASSET_PATHS.farming.plantsWatered,
      crop_items: ASSET_PATHS.farming.items,
      fish_sheet: ASSET_PATHS.fishing.fishSheet,
      ui_inventory_blocks: ASSET_PATHS.ui.inventoryBlocks,
      ui_emoji_sheet: ASSET_PATHS.ui.emojiSheet,
      object_fences: ASSET_PATHS.objects.fences,
      object_furniture: ASSET_PATHS.objects.furniture
    };
    for (const [key, path] of Object.entries(paths)) {
      const { frameWidth, frameHeight } = SHEETS[key];
      this.load.spritesheet(key, path, { frameWidth, frameHeight });
    }
    this.load.image('fishing_rod', ASSET_PATHS.fishing.rod);
  }

  create() {
    this.scene.start(SCENE_KEYS.MAIN_MENU);
  }
}