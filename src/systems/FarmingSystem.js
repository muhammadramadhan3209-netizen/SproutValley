import {
  TILE_SIZE,
  SOIL_STATE,
  CROP_LAYOUT,
  FARMING
} from '../config/constants.js';
import { groundFrame, sheetColumns } from '../config/assetFrames.js';

export class FarmingSystem {
  constructor(scene, tileMap, inventorySystem, cropsData) {
    this.scene = scene;
    this.tileMap = tileMap;
    this.tileSprites = [];
    this.cropSprites = [];
    this.cropFrames = [];
    this.inventory = inventorySystem;
    this.cropsData = cropsData;
    this.plots = new Map();
    this.lastTickAt = 0;
    this.indicators = new Map();
    this.onChange = null;
    this.timeSystem = null;

    this._buildSoilSprites();
    this._initializePlots();
  }

  setTimeSystem(timeSystem) {
    this.timeSystem = timeSystem;
  }

  _getGrowthMultiplier() {
    if (!this.timeSystem) return 1;
    const phase = this.timeSystem.getPhase();
    const map = FARMING.growthSpeedByPhase;
    return map && map[phase] !== undefined ? map[phase] : 1;
  }

  _buildSoilSprites() {
    const { width, height } = this.tileMap.dimensions;
    const groundLayer = this.scene.groundLayer;


    for (let ty = 0; ty < height; ty++) {
      this.tileSprites[ty] = [];
      this.cropSprites[ty] = [];
      this.cropFrames[ty] = [];
      for (let tx = 0; tx < width; tx++) {
        this.tileSprites[ty][tx] = groundLayer?.list[ty * width + tx] || null;
        this.cropSprites[ty][tx] = null;
        this.cropFrames[ty][tx] = null;
      }
    }
  }

  _initializePlots() {
    const area = FARMING.plotsArea;
    for (let ty = area.y0; ty <= area.y1; ty++) {
      for (let tx = area.x0; tx <= area.x1; tx++) {
        this.plots.set(`${tx},${ty}`, {
          tx,
          ty,
          state: SOIL_STATE.GRASS,
          cropId: null,
          stage: 0,
          plantedAt: 0,
          lastWateredAt: 0,
          progress: 0
        });
      }
    }
  }

  getPlotAtTile(tx, ty) {
    return this.plots.get(`${tx},${ty}`);
  }

  isInPlotArea(tx, ty) {
    const area = FARMING.plotsArea;
    return tx >= area.x0 && tx <= area.x1 && ty >= area.y0 && ty <= area.y1;
  }

  _getNearestPlotTile(tx, ty) {
    if (this.isInPlotArea(tx, ty)) return { tx, ty };
    const area = FARMING.plotsArea;
    const cx = (area.x0 + area.x1) / 2;
    const cy = (area.y0 + area.y1) / 2;
    let best = null;
    let bestDist = Infinity;
    for (let ty2 = area.y0; ty2 <= area.y1; ty2++) {
      for (let tx2 = area.x0; tx2 <= area.x1; tx2++) {
        const dx = tx2 - tx;
        const dy = ty2 - ty;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          best = { tx: tx2, ty: ty2 };
        }
      }
    }
    if (!best) return null;
    void cx;
    void cy;
    return bestDist <= FARMING.actionRangeTiles ? best : null;
  }

  findActionTarget(tx, ty) {
    return this._getNearestPlotTile(tx, ty);
  }

  performAction(playerTx, playerTy, action, cropId = null) {
    const target = this.findActionTarget(playerTx, playerTy);
    if (!target) {
      this._showIndicator(playerTx, playerTy, 'out of range', '#ff6666');
      return { ok: false, reason: 'out_of_range' };
    }
    const plot = this.getPlotAtTile(target.tx, target.ty);
    if (!plot) return { ok: false, reason: 'no_plot' };

    let result;
    switch (action) {
      case 'till':
        result = this._tillPlot(plot);
        break;
      case 'water':
        result = this._waterPlot(plot);
        break;
      case 'plant':
        result = this._plantPlot(plot, cropId);
        break;
      case 'harvest':
        result = this._harvestPlot(plot);
        break;
      default:
        result = { ok: false, reason: 'unknown_action' };
    }
    if (result.ok && this.onChange) {
      try { this.onChange(action, plot); } catch (e) { /* noop */ }
    }
    return result;
  }

  _tillPlot(plot) {
    if (plot.state === SOIL_STATE.GRASS) {
      plot.state = SOIL_STATE.TILLED;
      this._updateSoilTile(plot);
      this._showIndicator(plot.tx, plot.ty, 'tilled', '#cccccc');
      return { ok: true, action: 'till' };
    }
    this._showIndicator(plot.tx, plot.ty, 'already tilled', '#ffcc66');
    return { ok: false, reason: 'already_tilled' };
  }

  _waterPlot(plot) {
    if (plot.state === SOIL_STATE.TILLED) {
      plot.state = SOIL_STATE.TILLED_WATERED;
      plot.lastWateredAt = Date.now();
      this._updateSoilTile(plot);
      this._showIndicator(plot.tx, plot.ty, 'watered', '#6cc8e8');
      return { ok: true, action: 'water' };
    }
    if (plot.state === SOIL_STATE.PLANTED) {
      plot.state = SOIL_STATE.PLANTED_WATERED;
      plot.lastWateredAt = Date.now();
      this._updateSoilTile(plot);
      this._updateCropSprite(plot);
      this._showIndicator(plot.tx, plot.ty, 'watered', '#6cc8e8');
      return { ok: true, action: 'water' };
    }
    this._showIndicator(plot.tx, plot.ty, 'cannot water', '#ff8866');
    return { ok: false, reason: 'cannot_water' };
  }

  _plantPlot(plot, cropId) {
    if (!cropId || !this.cropsData[cropId]) {
      return { ok: false, reason: 'invalid_crop' };
    }
    if (plot.state !== SOIL_STATE.TILLED && plot.state !== SOIL_STATE.TILLED_WATERED) {
      this._showIndicator(plot.tx, plot.ty, 'till first', '#ff8866');
      return { ok: false, reason: 'not_tilled' };
    }
    const seedId = this.cropsData[cropId].seedId;
    if (!this.inventory.hasItem(seedId, 1)) {
      this._showIndicator(plot.tx, plot.ty, 'no seeds', '#ff8866');
      return { ok: false, reason: 'no_seeds' };
    }
    this.inventory.removeItem(seedId, 1);
    plot.cropId = cropId;
    plot.stage = 0;
    plot.plantedAt = Date.now();
    plot.lastWateredAt = plot.state === SOIL_STATE.TILLED_WATERED ? Date.now() : 0;
    plot.progress = 0;
    plot.state = plot.state === SOIL_STATE.TILLED_WATERED ? SOIL_STATE.PLANTED_WATERED : SOIL_STATE.PLANTED;
    this._updateSoilTile(plot);
    this._updateCropSprite(plot);
    this._showIndicator(plot.tx, plot.ty, `planted ${cropId}`, '#9bd07a');
    return { ok: true, action: 'plant', cropId };
  }

  _harvestPlot(plot) {
    if (!plot.cropId) {
      this._showIndicator(plot.tx, plot.ty, 'nothing to harvest', '#ff8866');
      return { ok: false, reason: 'no_crop' };
    }
    const crop = this.cropsData[plot.cropId];
    if (plot.stage < crop.stages - 1) {
      this._showIndicator(plot.tx, plot.ty, 'not ready', '#ffcc66');
      return { ok: false, reason: 'not_ready' };
    }
    this.inventory.addItem(crop.harvestId, crop.harvestYield);

    if (crop.regrowable) {
      plot.stage = crop.stages - 2;
      plot.state = SOIL_STATE.PLANTED;
      plot.lastWateredAt = 0;
      this._updateSoilTile(plot);
      this._updateCropSprite(plot);
      this._showIndicator(plot.tx, plot.ty, `harvested +${crop.harvestYield}`, '#ffd700');
    } else {
      plot.state = SOIL_STATE.TILLED;
      plot.cropId = null;
      plot.stage = 0;
      plot.progress = 0;
      this._updateSoilTile(plot);
      this._removeCropSprite(plot);
      this._showIndicator(plot.tx, plot.ty, `harvested +${crop.harvestYield}`, '#ffd700');
    }
    return { ok: true, action: 'harvest', cropId: plot.cropId };
  }

  _updateSoilTile(plot) {
    const sprite = this.tileSprites[plot.ty]?.[plot.tx];
    if (!sprite) return;
    const tileKey = this._getTileKeyForState(plot.state);
    const tile = plot.state === SOIL_STATE.GRASS ? 0 : 1;
    sprite.setTexture(tileKey, groundFrame(tile, plot.tx, plot.ty));
    sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
    sprite.setTint(this._isWateredSoil(plot.state) ? 0xb99778 : 0xffffff);
  }

  _getTileKeyForState(state) {
    if (state === SOIL_STATE.GRASS) return 'tileset_grass';
    return 'tileset_dirt';
  }

  _updateCropSprite(plot) {
    if (!plot.cropId) {
      this._removeCropSprite(plot);
      return;
    }
    const crop = this.cropsData[plot.cropId];
    const layout = CROP_LAYOUT[plot.cropId];
    if (!layout) return;
    const stage = Math.max(0, Math.min(plot.stage, crop.stages - 1));
    const col = layout.cols[stage] !== undefined ? layout.cols[stage] : stage;
    const frame = layout.row * sheetColumns('plants_dry') + col;

    let sprite = this.cropSprites[plot.ty]?.[plot.tx];
    if (!sprite) {
      const textureKey = this._isWateredSoil(plot.state) ? 'plants_watered' : 'plants_dry';
      const px = plot.tx * TILE_SIZE + TILE_SIZE / 2;
      const py = plot.ty * TILE_SIZE + TILE_SIZE;
      sprite = this.scene.add.image(px, py, textureKey, frame).setOrigin(0.5, 1);
      sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
      sprite.setDepth(8);
      this.cropSprites[plot.ty][plot.tx] = sprite;
    } else {
      const textureKey = this._isWateredSoil(plot.state) ? 'plants_watered' : 'plants_dry';
      sprite.setTexture(textureKey, frame);
    }
  }

  _removeCropSprite(plot) {
    const sprite = this.cropSprites[plot.ty]?.[plot.tx];
    if (sprite) {
      sprite.destroy();
      this.cropSprites[plot.ty][plot.tx] = null;
    }
  }

  _isWateredSoil(state) {
    return state === SOIL_STATE.TILLED_WATERED || state === SOIL_STATE.PLANTED_WATERED;
  }

  update(time, delta) {
    if (time - this.lastTickAt < FARMING.growthTickMs) {
      this._updateIndicators(time);
      return;
    }
    this.lastTickAt = time;

    const nowWall = Date.now();
    const growthMult = this._getGrowthMultiplier();
    for (const plot of this.plots.values()) {
      if (plot.state !== SOIL_STATE.PLANTED_WATERED) continue;
      const crop = this.cropsData[plot.cropId];
      if (!crop) continue;
      if (plot.stage >= crop.stages - 1) continue;

      const elapsed = (nowWall - plot.plantedAt) * growthMult;
      const stageDuration = crop.growthTimeMs / (crop.stages - 1);
      const newStage = Math.min(
        crop.stages - 1,
        Math.floor(elapsed / stageDuration)
      );
      if (newStage !== plot.stage) {
        plot.stage = newStage;
        this._updateCropSprite(plot);
      }

      const realElapsed = nowWall - plot.plantedAt;
      if (realElapsed > crop.growthTimeMs + crop.growthTimeMs / 2) {
        plot.state = SOIL_STATE.PLANTED;
        plot.lastWateredAt = 0;
        this._updateCropSprite(plot);
      }
    }

    this._updateIndicators(time);
  }

  _showIndicator(tx, ty, text, color = '#ffffff') {
    const px = tx * TILE_SIZE + TILE_SIZE / 2;
    const py = ty * TILE_SIZE;
    const key = `${tx},${ty}`;
    const scene = this.scene;
    const old = this.indicators.get(key);
    if (old && old.text && old.text.destroy) old.text.destroy();
    const txt = scene.add.text(px, py - 6, text, {
      fontSize: '8px',
      color,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 1);
    txt.setDepth(50);
    this.indicators.set(key, { text: txt, expires: Date.now() + 1200 });
  }

  _updateIndicators() {
    const now = Date.now();
    for (const [key, entry] of this.indicators) {
      if (now > entry.expires) {
        entry.text.destroy();
        this.indicators.delete(key);
      } else {
        const remain = entry.expires - now;
        entry.text.setAlpha(Math.max(0, remain / 1200));
        entry.text.y -= 0.4;
      }
    }
  }
}