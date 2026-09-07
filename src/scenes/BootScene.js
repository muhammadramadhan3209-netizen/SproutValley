import { SCENE_KEYS } from '../config/constants.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.BOOT });
  }

  create() {
    this.scene.start(SCENE_KEYS.PRELOAD);
  }
}