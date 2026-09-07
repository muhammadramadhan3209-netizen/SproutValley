import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecorationSystem } from '../src/systems/DecorationSystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';

function makeMockScene() {
  return {
    add: {
      image: () => {
        const obj = {
          setOrigin() { return obj; },
          setDisplaySize() { return obj; },
          setDepth() { return obj; },
          setTexture() { return obj; },
          setVisible() { return obj; },
          setAlpha() { return obj; },
          setPosition() { return obj; },
          destroy() {}
        };
        return obj;
      }
    }
  };
}

function makeSystem() {
  const scene = makeMockScene();
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  inv.addItem('decoration_wood_fence', 3);
  const dec = new DecorationSystem(scene, items, inv);
  return { dec, inv, items };
}

test('DecorationSystem: starts empty', () => {
  const { dec } = makeSystem();
  assert.equal(dec.count(), 0);
  assert.deepEqual(dec.list(), []);
});

test('DecorationSystem: place adds to world and removes from inventory', () => {
  const { dec, inv } = makeSystem();
  const before = inv.countItem('decoration_wood_fence');
  const r = dec.place('decoration_wood_fence', 64, 32);
  assert.equal(r.ok, true);
  assert.equal(dec.count(), 1);
  assert.equal(inv.countItem('decoration_wood_fence'), before - 1);
});

test('DecorationSystem: place fails on invalid item', () => {
  const { dec } = makeSystem();
  const r = dec.place('unknown_item', 0, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_item');
});

test('DecorationSystem: place fails on non-decoration item', () => {
  const { dec } = makeSystem();
  const r = dec.place('seed_carrot', 0, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_decoration');
});

test('DecorationSystem: place fails on invalid position', () => {
  const { dec } = makeSystem();
  const r = dec.place('decoration_wood_fence', -10, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_position');
});

test('DecorationSystem: place fails when inventory has no item', () => {
  const { dec, inv } = makeSystem();
  for (let i = 0; i < 10; i++) inv.removeItem('decoration_wood_fence', 1);
  const r = dec.place('decoration_wood_fence', 0, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_item');
});

test('DecorationSystem: place fails on duplicate position', () => {
  const { dec, inv } = makeSystem();
  for (let i = 0; i < 10; i++) inv.addItem('decoration_wood_fence', 1);
  dec.place('decoration_wood_fence', 32, 32);
  const r = dec.place('decoration_wood_fence', 32, 32);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'occupied');
});

test('DecorationSystem: place respects maxDecorations limit', () => {
  const { dec, inv } = makeSystem();
  dec.maxDecorations = 2;
  inv.addItem('decoration_wood_fence', 10);
  dec.place('decoration_wood_fence', 0, 0);
  dec.place('decoration_wood_fence', 16, 0);
  const r = dec.place('decoration_wood_fence', 32, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'limit_reached');
});

test('DecorationSystem: remove returns item to inventory', () => {
  const { dec, inv } = makeSystem();
  dec.place('decoration_wood_fence', 16, 16);
  const before = inv.countItem('decoration_wood_fence');
  const r = dec.remove(16, 16);
  assert.equal(r.ok, true);
  assert.equal(dec.count(), 0);
  assert.equal(inv.countItem('decoration_wood_fence'), before + 1);
});

test('DecorationSystem: remove at empty position fails', () => {
  const { dec } = makeSystem();
  const r = dec.remove(0, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_found');
});

test('DecorationSystem: isValidPosition basic check', () => {
  const { dec } = makeSystem();
  assert.equal(dec.isValidPosition(0, 0), true);
  assert.equal(dec.isValidPosition(100, 100), true);
  assert.equal(dec.isValidPosition(-1, 0), false);
  assert.equal(dec.isValidPosition(NaN, 0), false);
});

test('DecorationSystem: isOccupied tracks placed items', () => {
  const { dec, inv } = makeSystem();
  inv.addItem('decoration_wood_fence', 5);
  assert.equal(dec.isOccupied(16, 16), false);
  dec.place('decoration_wood_fence', 16, 16);
  assert.equal(dec.isOccupied(16, 16), true);
  assert.equal(dec.isOccupied(32, 16), false);
});

test('DecorationSystem: snapToGrid snaps to 16px', () => {
  const { dec } = makeSystem();
  const a = dec.snapToGrid(20, 25);
  assert.equal(a.x, 16);
  assert.equal(a.y, 16);
  const b = dec.snapToGrid(33, 18);
  assert.equal(b.x, 32);
  assert.equal(b.y, 16);
});

test('DecorationSystem: worldToTile and tileToWorld conversion', () => {
  const { dec } = makeSystem();
  const t = dec.worldToTile(20, 33);
  assert.equal(t.tx, 1);
  assert.equal(t.ty, 2);
  const w = dec.tileToWorld(3, 4);
  assert.equal(w.x, 48);
  assert.equal(w.y, 64);
});

test('DecorationSystem: snapshot roundtrip', () => {
  const { dec, inv } = makeSystem();
  inv.addItem('decoration_lamp', 1);
  dec.place('decoration_wood_fence', 0, 0);
  dec.place('decoration_lamp', 16, 16);
  const snap = dec.snapshot();
  assert.equal(snap.length, 2);
  const dec2 = new DecorationSystem(makeMockScene(), new ItemSystem(), null);
  const ok = dec2.restore(snap);
  assert.equal(ok, true);
  assert.equal(dec2.count(), 2);
  const list = dec2.list();
  assert.deepEqual(list[0], { id: 'decoration_wood_fence', x: 0, y: 0 });
  assert.deepEqual(list[1], { id: 'decoration_lamp', x: 16, y: 16 });
});

test('DecorationSystem: restore ignores invalid entries', () => {
  const { dec } = makeSystem();
  const dec2 = new DecorationSystem(makeMockScene(), new ItemSystem(), null);
  dec2.restore([
    { id: 'decoration_wood_fence', x: 0, y: 0 },
    { id: null, x: 0, y: 0 },
    { id: 'decoration_lamp', x: NaN, y: 0 },
    'invalid',
    null,
    { id: 'decoration_lamp', x: 32, y: 32 }
  ]);
  assert.equal(dec2.count(), 2);
});

test('DecorationSystem: restore with non-array returns false', () => {
  const { dec } = makeSystem();
  assert.equal(dec.restore(null), false);
  assert.equal(dec.restore('string'), false);
  assert.equal(dec.restore({}), false);
});

test('DecorationSystem: restore respects maxDecorations', () => {
  const { dec } = makeSystem();
  dec.maxDecorations = 1;
  const dec2 = new DecorationSystem(makeMockScene(), new ItemSystem(), null);
  dec2.maxDecorations = 1;
  dec2.restore([
    { id: 'decoration_wood_fence', x: 0, y: 0 },
    { id: 'decoration_lamp', x: 16, y: 0 }
  ]);
  assert.equal(dec2.count(), 1);
});

test('DecorationSystem: clear removes all and returns count', () => {
  const { dec, inv } = makeSystem();
  inv.addItem('decoration_wood_fence', 5);
  dec.place('decoration_wood_fence', 0, 0);
  dec.place('decoration_wood_fence', 16, 0);
  dec.place('decoration_wood_fence', 32, 0);
  const before = inv.countItem('decoration_wood_fence');
  const removed = dec.clear();
  assert.equal(removed.length, 3);
  assert.equal(dec.count(), 0);
  assert.equal(inv.countItem('decoration_wood_fence'), before + 3);
});

test('DecorationSystem: getAt returns decoration or null', () => {
  const { dec } = makeSystem();
  assert.equal(dec.getAt(0, 0), null);
  dec.place('decoration_wood_fence', 16, 16);
  const d = dec.getAt(16, 16);
  assert.equal(d.id, 'decoration_wood_fence');
  assert.equal(dec.getAt(99, 99), null);
});

test('DecorationSystem: removeByIndex works', () => {
  const { dec, inv } = makeSystem();
  dec.place('decoration_wood_fence', 0, 0);
  dec.place('decoration_wood_fence', 16, 0);
  const before = inv.countItem('decoration_wood_fence');
  const r = dec.removeByIndex(0);
  assert.equal(r.ok, true);
  assert.equal(dec.count(), 1);
  assert.equal(inv.countItem('decoration_wood_fence'), before + 1);
});

test('DecorationSystem: onChange listener fires', () => {
  const { dec } = makeSystem();
  const events = [];
  dec.onChange((e) => events.push(e));
  dec.place('decoration_wood_fence', 0, 0);
  dec.remove(0, 0);
  dec.clear();
  assert.equal(events.length, 3);
  assert.equal(events[0], 'place');
  assert.equal(events[1], 'remove');
  assert.equal(events[2], 'clear');
});

test('DecorationSystem: place and remove roundtrip inventory', () => {
  const { dec, inv } = makeSystem();
  const start = inv.countItem('decoration_wood_fence');
  dec.place('decoration_wood_fence', 0, 0);
  dec.place('decoration_wood_fence', 16, 0);
  assert.equal(inv.countItem('decoration_wood_fence'), start - 2);
  dec.remove(0, 0);
  dec.remove(16, 0);
  assert.equal(inv.countItem('decoration_wood_fence'), start);
});