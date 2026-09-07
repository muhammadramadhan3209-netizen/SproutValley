import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';

function makeSystem() {
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  return { inv, items };
}

test('InventorySystem: capacity and initial empty', () => {
  const { inv } = makeSystem();
  assert.equal(inv.capacity, 24);
  assert.equal(inv.slots.length, 24);
  assert.equal(inv.slots.every(s => s === null), true);
  assert.equal(inv.getActiveSlot(), 0);
});

test('InventorySystem: addItem stacks into existing slot', () => {
  const { inv } = makeSystem();
  inv.addItem('seed_carrot', 5);
  inv.addItem('seed_carrot', 3);
  assert.equal(inv.countItem('seed_carrot'), 8);
  const slot0 = inv.getSlot(0);
  assert.equal(slot0.itemId, 'seed_carrot');
  assert.equal(slot0.quantity, 8);
});

test('InventorySystem: addItem respects maxStack from items.json', () => {
  const { inv } = makeSystem();
  inv.addItem('seed_carrot', 99);
  inv.addItem('seed_carrot', 1);
  assert.equal(inv.countItem('seed_carrot'), 100);
  assert.equal(inv.getSlot(0).quantity, 99);
  assert.equal(inv.getSlot(1).quantity, 1);
});

test('InventorySystem: addItem spans multiple slots if needed', () => {
  const { inv } = makeSystem();
  inv.addItem('seed_carrot', 200);
  const slots = inv.getAllSlots().filter(s => s);
  assert.equal(slots.length, 3);
  assert.equal(inv.countItem('seed_carrot'), 200);
  for (const s of slots) {
    assert.ok(s.quantity > 0 && s.quantity <= 99);
  }
});

test('InventorySystem: removeItem deducts correctly', () => {
  const { inv } = makeSystem();
  inv.addItem('seed_carrot', 10);
  inv.removeItem('seed_carrot', 4);
  assert.equal(inv.countItem('seed_carrot'), 6);
});

test('InventorySystem: removeItem returns 0 when insufficient', () => {
  const { inv } = makeSystem();
  inv.addItem('seed_carrot', 3);
  const removed = inv.removeItem('seed_carrot', 10);
  assert.equal(removed, 3);
  assert.equal(inv.countItem('seed_carrot'), 0);
});

test('InventorySystem: cycleActiveSlot wraps around', () => {
  const { inv } = makeSystem();
  assert.equal(inv.getActiveSlot(), 0);
  inv.cycleActiveSlot(-1);
  assert.equal(inv.getActiveSlot(), 23);
  inv.cycleActiveSlot(1);
  assert.equal(inv.getActiveSlot(), 0);
});

test('InventorySystem: hasItem reports correctly', () => {
  const { inv } = makeSystem();
  assert.equal(inv.hasItem('seed_carrot', 1), false);
  inv.addItem('seed_carrot', 3);
  assert.equal(inv.hasItem('seed_carrot', 3), true);
  assert.equal(inv.hasItem('seed_carrot', 4), false);
});

test('InventorySystem: clear empties all slots', () => {
  const { inv } = makeSystem();
  inv.addItem('seed_carrot', 10);
  inv.addItem('seed_tomato', 5);
  inv.clear();
  assert.equal(inv.getAllSlots().every(s => s === null), true);
});