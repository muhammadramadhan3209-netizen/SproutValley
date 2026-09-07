import { GAME_WIDTH, GAME_HEIGHT, COLORS, DEFAULT_FONT } from './constants.js';

export const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game'
  },
  antialias: false,
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  banner: false,
  fps: {
    target: 60,
    min: 30,
    forceSetTimeOut: false
  },
  input: {
    activePointers: 3,
    windowEvents: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
    powerPreference: 'low-power'
  },
  defaultFontFamily: DEFAULT_FONT
};

export const debugConfig = {
  enabled: false,
  showFPS: false,
  showCoords: false
};