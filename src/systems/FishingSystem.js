import { FISHING, TILE_SIZE, TILE_WATER } from '../config/constants.js';

export const FISH_STATE = {
  IDLE: 'idle',
  CASTING: 'casting',
  WAITING: 'waiting',
  BITE: 'bite',
  REELING: 'reeling'
};

export class FishingSystem {
  constructor(scene, tileMap, inventorySystem, fishData) {
    this.scene = scene;
    this.tileMap = tileMap;
    this.inventory = inventorySystem;
    this.fishData = fishData;

    this.state = FISH_STATE.IDLE;
    this.lastStateChange = 0;
    this.biteAt = 0;
    this.biteWindowMs = 1500;
    this.bobPhase = 0;
    this._fishPool = this._buildPool();
    this._biteTimer = null;
    this.onCatch = null;
    this.timeSystem = null;

    this.indicator = null;
    this.fxLayer = scene.add.container(0, 0).setDepth(60);
  }

  _buildPool() {
    const pool = [];
    for (const id of Object.keys(this.fishData)) {
      const fish = this.fishData[id];
      pool.push({ id, ...fish });
    }
    return pool;
  }

  isPlayerNearWater(playerX, playerY) {
    const tx = Math.floor(playerX / TILE_SIZE);
    const ty = Math.floor((playerY - 1) / TILE_SIZE);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = tx + ox;
        const ny = ty + oy;
        if (ny < 0 || ny >= this.tileMap.length) continue;
        if (nx < 0 || nx >= this.tileMap[0].length) continue;
        if (this.tileMap[ny][nx] === TILE_WATER) return true;
      }
    }
    return false;
  }

  getState() {
    return this.state;
  }

  isBusy() {
    return (
      this.state === FISH_STATE.CASTING ||
      this.state === FISH_STATE.WAITING ||
      this.state === FISH_STATE.BITE ||
      this.state === FISH_STATE.REELING
    );
  }

  startFishing(player) {
    if (this.isBusy()) {
      return { ok: false, reason: 'already_fishing' };
    }
    if (!this.isPlayerNearWater(player.x, player.y)) {
      this._showIndicator(player.x, player.y - TILE_SIZE, 'go near water', '#ff8866');
      return { ok: false, reason: 'no_water' };
    }
    this._clearBiteTimer();
    this._setState(FISH_STATE.CASTING);
    this.lastStateChange = this.scene.time.now;
    this._showIndicator(player.x, player.y - TILE_SIZE, 'Casting...', '#9bd07a');

    this.scene.time.delayedCall(FISHING.castDurationMs, () => {
      if (this.state !== FISH_STATE.CASTING) return;
      this._setState(FISH_STATE.WAITING);
      this._showIndicator(player.x, player.y - TILE_SIZE, 'Waiting...', '#cccccc');
      const phase = this.timeSystem?.getPhase?.() || 'morning';
      const timeMod = (phase === 'night' || phase === 'evening') ? 0.7 : 1.0;
      const baseWait = FISHING.waitMinMs
        + Math.floor(Math.random() * (FISHING.waitMaxMs - FISHING.waitMinMs));
      const waitMs = Math.max(200, Math.floor(baseWait * timeMod));
      this.scene.time.delayedCall(waitMs, () => {
        if (this.state !== FISH_STATE.WAITING) return;
        this._setState(FISH_STATE.BITE);
        this.biteAt = this.scene.time.now;
        this._showIndicator(player.x, player.y - TILE_SIZE - 8, '! BITE !', '#ffd700');
        this._clearBiteTimer();
        this._biteTimer = this.scene.time.delayedCall(this.biteWindowMs, () => {
          if (this.state !== FISH_STATE.BITE) return;
          this._setState(FISH_STATE.IDLE);
          this._showIndicator(player.x, player.y - TILE_SIZE, 'fish got away', '#ff8866');
        });
      });
    });
    return { ok: true };
  }

  tryCatch(player) {
    if (this.state !== FISH_STATE.BITE) {
      if (this.state === FISH_STATE.WAITING) {
        this._clearBiteTimer();
        this._setState(FISH_STATE.IDLE);
        this._showIndicator(player.x, player.y - TILE_SIZE, 'too early', '#ff8866');
        return { ok: false, reason: 'too_early' };
      }
      return { ok: false, reason: 'no_bite' };
    }
    this._clearBiteTimer();
    const elapsed = this.scene.time.now - this.biteAt;
    if (elapsed > this.biteWindowMs) {
      this._setState(FISH_STATE.IDLE);
      this._showIndicator(player.x, player.y - TILE_SIZE, 'fish got away', '#ff8866');
      return { ok: false, reason: 'too_late' };
    }
    this._setState(FISH_STATE.REELING);
    const caught = this._rollFish();
    if (caught) {
      this.inventory.addItem(caught.id, 1);
      this._showIndicator(player.x, player.y - TILE_SIZE - 16, `Caught: ${caught.name}!`, '#ffd700');
      if (this.onCatch) {
        try { this.onCatch(caught); } catch (e) { /* noop */ }
      }
    }
    this.scene.time.delayedCall(600, () => {
      this._setState(FISH_STATE.IDLE);
    });
    return { ok: true, fish: caught };
  }

  cancel(player) {
    if (this.state === FISH_STATE.IDLE) return;
    this._clearBiteTimer();
    this._setState(FISH_STATE.IDLE);
    this._showIndicator(player.x, player.y - TILE_SIZE, 'canceled', '#ffffff');
  }

  _clearBiteTimer() {
    if (this._biteTimer) {
      this._biteTimer.remove();
      this._biteTimer = null;
    }
  }

  setTimeSystem(timeSystem) {
    this.timeSystem = timeSystem;
  }

  _rollFish() {
    const total = this._fishPool.reduce((sum, f) => sum + (f.chance || 0), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const fish of this._fishPool) {
      r -= fish.chance || 0;
      if (r <= 0) return fish;
    }
    return this._fishPool[this._fishPool.length - 1];
  }

  getTimeBasedWeight(fish) {
    if (!this.timeSystem || !fish || !fish.rarity) return 1;
    const phase = this.timeSystem.getPhase();
    if (fish.rarity === 'rare' && (phase === 'evening' || phase === 'night')) {
      return 1.5;
    }
    if (fish.rarity === 'common' && (phase === 'morning' || phase === 'noon')) {
      return 1.2;
    }
    return 1;
  }

  _setState(newState) {
    this.state = newState;
    this.lastStateChange = this.scene.time.now;
  }

  _showIndicator(x, y, text, color = '#ffffff') {
    if (this.indicator) {
      this.indicator.text.destroy();
      this.indicator = null;
    }
    const t = this.scene.add.text(x, y, text, {
      fontSize: '8px',
      color,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 1);
    t.setDepth(80);
    this.indicator = { text: t, expires: Date.now() + 1800, x, y };
  }

  update(time, delta) {
    if (!this.indicator) return;
    const now = Date.now();
    const ind = this.indicator;
    if (now > ind.expires) {
      ind.text.destroy();
      this.indicator = null;
    } else {
      const remain = ind.expires - now;
      ind.text.setAlpha(Math.max(0, remain / 1800));
    }

    if (this.state === FISH_STATE.BITE) {
      this.bobPhase += delta;
      if (this.indicator && this.indicator.text) {
        this.indicator.text.y = this.indicator.y - 2 + Math.sin(this.bobPhase / 100) * 2;
      }
    }
  }
}