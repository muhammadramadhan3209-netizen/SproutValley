import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FarmingSystem } from '../src/systems/FarmingSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { SOIL_STATE } from '../src/config/constants.js';
import cropsData from '../src/data/crops.json' with { type: 'json' };

function makeMockScene() {
  const tiles = [];
  for (let r = 0; r < 25; r++) {
    tiles.push([]);
    for (let c = 0; c < 30; c++) {
      tiles[r].push({ setTexture(key, frame) { this.key = key; this.frame = frame; }, setTint(tint) { this.tint = tint; }, setVisible() {}, setDisplaySize() {}, setOrigin() {}, destroy() {}, setDepth() {} });
    }
  }
  return {
    time: { now: Date.now(), delayedCall: () => ({ remove() {} }) },
    add: {
      image: () => ({ setOrigin() { return this; }, setDisplaySize() { return this; }, setDepth() { return this; }, destroy() {}, setTexture() { return this; }, setVisible() { return this; } }),
      text: () => ({ setOrigin() { return this; }, setDepth() { return this; }, destroy() {}, setAlpha() { return this; }, setY() {} }),
      container: () => ({ list: tiles.flat(), setDepth() { return this; } })
    },
    groundLayer: { list: tiles.flat() }
  };
}

function makeFarming() {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.addItem('seed_carrot', 5);
  inv.addItem('seed_tomato', 3);
  inv.addItem('seed_strawberry', 2);
  const fs = new FarmingSystem(
    scene,
    { dimensions: { width: 30, height: 25 } },
    inv,
    cropsData
  );
  return { fs, inv, scene };
}

test('FarmingSystem: plots initialized in defined area', () => {
  const { fs } = makeFarming();
  assert.ok(fs.plots.size > 0);
  assert.ok(fs.plots.has('18,5'));
  assert.ok(fs.plots.has('24,9'));
});

test('FarmingSystem: till changes grass to tilled', () => {
  const { fs } = makeFarming();
  const r = fs.performAction(20, 6, 'till');
  assert.equal(r.ok, true);
  const plot = fs.getPlotAtTile(20, 6);
  assert.equal(plot.state, SOIL_STATE.TILLED);
});

test('FarmingSystem: plant requires tilled soil', () => {
  const { fs } = makeFarming();
  fs.performAction(20, 6, 'plant', 'carrot');
  const plot = fs.getPlotAtTile(20, 6);
  assert.notEqual(plot.state, SOIL_STATE.PLANTED_WATERED);
});

test('FarmingSystem: till then water then plant full cycle', () => {
  const { fs, inv } = makeFarming();
  assert.equal(fs.performAction(20, 6, 'till').ok, true);
  assert.equal(fs.performAction(20, 6, 'water').ok, true);
  const before = inv.countItem('seed_carrot');
  const r = fs.performAction(20, 6, 'plant', 'carrot');
  assert.equal(r.ok, true);
  assert.equal(inv.countItem('seed_carrot'), before - 1);
  const plot = fs.getPlotAtTile(20, 6);
  assert.equal(plot.cropId, 'carrot');
  assert.equal(plot.stage, 0);
});

test('FarmingSystem: plant fails without seeds', () => {
  const { fs } = makeFarming();
  fs.performAction(20, 6, 'till');
  fs.performAction(20, 6, 'water');
  fs.performAction(20, 7, 'till');
  fs.performAction(20, 7, 'water');
  fs.performAction(20, 8, 'till');
  fs.performAction(20, 8, 'water');
  const before = fs.inventory.countItem('seed_carrot');
  for (let i = 0; i < before; i++) {
    fs.inventory.removeItem('seed_carrot', 1);
  }
  const r = fs.performAction(20, 8, 'plant', 'carrot');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_seeds');
});

test('FarmingSystem: harvest requires mature crop', () => {
  const { fs } = makeFarming();
  fs.performAction(20, 6, 'till');
  fs.performAction(20, 6, 'water');
  fs.performAction(20, 6, 'plant', 'carrot');
  const early = fs.performAction(20, 6, 'harvest');
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'not_ready');
  const plot = fs.getPlotAtTile(20, 6);
  plot.stage = cropsData.carrot.stages - 1;
  const r = fs.performAction(20, 6, 'harvest');
  assert.equal(r.ok, true);
  assert.equal(fs.inventory.countItem('harvest_carrot'), 1);
  assert.equal(plot.cropId, null);
});

test('FarmingSystem: strawberry regrows', () => {
  const { fs } = makeFarming();
  fs.performAction(20, 6, 'till');
  fs.performAction(20, 6, 'water');
  fs.performAction(20, 6, 'plant', 'strawberry');
  const plot = fs.getPlotAtTile(20, 6);
  plot.stage = cropsData.strawberry.stages - 1;
  const r = fs.performAction(20, 6, 'harvest');
  assert.equal(r.ok, true);
  assert.equal(plot.cropId, 'strawberry');
  assert.equal(plot.state, SOIL_STATE.PLANTED);
});

test('FarmingSystem: action outside range rejected', () => {
  const { fs } = makeFarming();
  const r = fs.performAction(0, 0, 'till');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'out_of_range');
});

test('FarmingSystem: onChange callback fires on success', () => {
  const { fs } = makeFarming();
  let calls = 0;
  fs.onChange = () => calls++;
  fs.performAction(20, 6, 'till');
  fs.performAction(20, 7, 'till');
  assert.equal(calls, 2);
});

test('FarmingSystem: invalid crop id rejected', () => {
  const { fs } = makeFarming();
  fs.performAction(20, 6, 'till');
  fs.performAction(20, 6, 'water');
  const r = fs.performAction(20, 6, 'plant', 'unknown_crop');
  assert.equal(r.ok, false);
});