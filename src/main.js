import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';
import { landscapeSize } from './config/mobileLayout.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { FarmScene } from './scenes/FarmScene.js';
import { LakeScene } from './scenes/LakeScene.js';

const config = {
  ...gameConfig,
  scene: [BootScene, PreloadScene, MainMenuScene, FarmScene, LakeScene]
};

window.addEventListener('load', () => {
  const parent = document.getElementById('game');
  if (!parent) {
    console.error('[Sprout Valley] #game container not found');
    return;
  }

  try {
    const size = landscapeSize(parent.clientWidth, parent.clientHeight);
    const game = new Phaser.Game({ ...config, scale: { ...config.scale, ...size } });
    window.__sproutValley = game;
    const rotate = document.getElementById('rotate-device');
    let portrait = false;
    let resizeFrame = null;
    const fit = () => {
      const nextPortrait = window.innerHeight > window.innerWidth;
      rotate.hidden = !nextPortrait;
      if (nextPortrait) {
        if (!portrait) { game.events.emit('blur'); game.loop.sleep(); }
      } else {
        const next = landscapeSize(parent.clientWidth, parent.clientHeight);
        if (game.scale.width !== next.width || game.scale.height !== next.height) {
          game.scale.setGameSize(next.width, next.height);
        }
        game.scale.refresh();
        if (portrait) game.loop.wake();
      }
      portrait = nextPortrait;
    };
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(fit);
    };
    window.addEventListener('resize', onResize);
    game.events.once('ready', fit);
    game.events.once('destroy', () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(resizeFrame);
    });
  } catch (err) {
    console.error('[Sprout Valley] Failed to start Phaser:', err);
  }
});