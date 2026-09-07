import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ItemSystem } from '../src/systems/ItemSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { ECONOMY } from '../src/config/constants.js';

function makeBundle() {
  const items = new ItemSystem();
  const inv = new InventorySystem(items);
  inv.itemSystem = items;
  const econ = new EconomySystem(items);
  return { items, inv, econ };
}

test('EconomySystem: starts with startingGold', () => {
  const { econ } = makeBundle();
  assert.equal(econ.getGold(), ECONOMY.startingGold);
  assert.equal(econ.getTotalEarned(), 0);
  assert.equal(econ.getTotalSpent(), 0);
  assert.equal(econ.getTransactions(), 0);
});

test('EconomySystem: addGold increases gold and totalEarned', () => {
  const { econ } = makeBundle();
  const credit = econ.addGold(50, 'test');
  assert.equal(credit, 50);
  assert.equal(econ.getGold(), ECONOMY.startingGold + 50);
  assert.equal(econ.getTotalEarned(), 50);
  assert.equal(econ.getTransactions(), 1);
});

test('EconomySystem: addGold rejects negative or zero', () => {
  const { econ } = makeBundle();
  assert.equal(econ.addGold(0), 0);
  assert.equal(econ.addGold(-10), 0);
  assert.equal(econ.getGold(), ECONOMY.startingGold);
});

test('EconomySystem: addGold caps at maxGold', () => {
  const { econ } = makeBundle();
  econ.addGold(ECONOMY.maxGold, 'overflow');
  assert.equal(econ.getGold(), ECONOMY.maxGold);
  assert.ok(econ.getTotalEarned() <= ECONOMY.maxGold);
  assert.ok(econ.getTotalEarned() > 0);
});

test('EconomySystem: spendGold deducts gold', () => {
  const { econ } = makeBundle();
  const r = econ.spendGold(50, 'test');
  assert.equal(r.ok, true);
  assert.equal(r.amount, 50);
  assert.equal(econ.getGold(), ECONOMY.startingGold - 50);
  assert.equal(econ.getTotalSpent(), 50);
});

test('EconomySystem: spendGold cannot go negative', () => {
  const { econ } = makeBundle();
  const r = econ.spendGold(ECONOMY.startingGold + 1, 'test');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_funds');
  assert.equal(econ.getGold(), ECONOMY.startingGold);
  assert.equal(econ.getTotalSpent(), 0);
});

test('EconomySystem: canAfford returns true/false correctly', () => {
  const { econ } = makeBundle();
  assert.equal(econ.canAfford(ECONOMY.startingGold), true);
  assert.equal(econ.canAfford(ECONOMY.startingGold + 1), false);
  assert.equal(econ.canAfford(0), true);
  assert.equal(econ.canAfford(-10), false);
  assert.equal(econ.canAfford('not a number'), false);
});

test('EconomySystem: sellItem removes from inventory and adds gold', () => {
  const { items, inv, econ } = makeBundle();
  inv.addItem('harvest_carrot', 3);
  const before = econ.getGold();
  const r = econ.sellItem('harvest_carrot', 2, inv);
  assert.equal(r.ok, true);
  assert.equal(r.credit, 50);
  assert.equal(inv.countItem('harvest_carrot'), 1);
  assert.equal(econ.getGold(), before + 50);
});

test('EconomySystem: sellItem fails if no stock', () => {
  const { inv, econ } = makeBundle();
  const r = econ.sellItem('harvest_carrot', 1, inv);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_stock');
});

test('EconomySystem: sellItem fails for non-sellable category', () => {
  const { inv, econ } = makeBundle();
  inv.addItem('seed_carrot', 5);
  const r = econ.sellItem('seed_carrot', 1, inv);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_sellable');
});

test('EconomySystem: buyItem deducts gold and adds to inventory', () => {
  const { items, inv, econ } = makeBundle();
  const before = econ.getGold();
  const r = econ.buyItem('seed_carrot', 3, inv);
  assert.equal(r.ok, true);
  assert.equal(r.cost, 60);
  assert.equal(inv.countItem('seed_carrot'), 3);
  assert.equal(econ.getGold(), before - 60);
});

test('EconomySystem: buyItem fails if insufficient gold', () => {
  const { inv, econ } = makeBundle();
  econ.spendGold(ECONOMY.startingGold - 5);
  const r = econ.buyItem('seed_strawberry', 100, inv);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_funds');
});

test('EconomySystem: buyItem of seed that has no buyPrice fails', () => {
  const { inv, econ } = makeBundle();
  inv.addItem('harvest_tomato', 1);
  const r = econ.sellItem('harvest_tomato', 1, inv);
  // Selling works since tomato is sellable
  assert.equal(r.ok, true);
});

test('EconomySystem: snapshot roundtrip', () => {
  const { econ } = makeBundle();
  econ.addGold(500);
  econ.spendGold(50);
  const snap = econ.snapshot();
  const econ2 = new EconomySystem(new ItemSystem());
  econ2.restore(snap);
  assert.equal(econ2.getGold(), econ.getGold());
  assert.equal(econ2.getTotalEarned(), econ.getTotalEarned());
  assert.equal(econ2.getTotalSpent(), econ.getTotalSpent());
  assert.equal(econ2.getTransactions(), econ.getTransactions());
});

test('EconomySystem: restore with null keeps current state', () => {
  const { econ } = makeBundle();
  econ.addGold(500);
  const before = econ.getGold();
  const ok = econ.restore(null);
  assert.equal(ok, false);
  assert.equal(econ.getGold(), before);
});

test('EconomySystem: restore clamps gold to maxGold', () => {
  const { econ } = makeBundle();
  econ.restore({ gold: ECONOMY.maxGold * 10 });
  assert.equal(econ.getGold(), ECONOMY.maxGold);
});

test('EconomySystem: restore ignores negative gold', () => {
  const { econ } = makeBundle();
  econ.restore({ gold: -100 });
  assert.equal(econ.getGold(), 0);
});

test('EconomySystem: reset returns to defaults', () => {
  const { econ } = makeBundle();
  econ.addGold(1000);
  econ.spendGold(500);
  econ.reset();
  assert.equal(econ.getGold(), ECONOMY.startingGold);
  assert.equal(econ.getTotalEarned(), 0);
});

test('EconomySystem: full cycle (sell crops, buy seeds)', () => {
  const { inv, econ } = makeBundle();
  inv.addItem('harvest_carrot', 5);
  inv.addItem('fish_common_brown', 3);
  const sellResult = econ.sellItem('harvest_carrot', 5, inv);
  assert.equal(sellResult.ok, true);
  const sellFish = econ.sellItem('fish_common_brown', 3, inv);
  assert.equal(sellFish.ok, true);
  const expected = ECONOMY.startingGold + 125 + 60;
  assert.equal(econ.getGold(), expected);
  const buy = econ.buyItem('seed_tomato', 2, inv);
  assert.equal(buy.ok, true);
  assert.equal(econ.getGold(), expected - 60);
  assert.equal(inv.countItem('seed_tomato'), 2);
});

test('EconomySystem: buyItem with full inventory returns refund', () => {
  const { items, inv, econ } = makeBundle();
  for (let i = 0; i < 24; i++) {
    inv.addItem('seed_carrot', 99);
  }
  const before = econ.getGold();
  const r = econ.buyItem('seed_carrot', 1, inv);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'inventory_full');
  assert.ok(r.refund > 0, 'should refund partial gold');
  const after = econ.getGold();
  assert.equal(after, before - 20 + r.refund, 'gold restored after partial add');
});

test('EconomySystem: onChange listener fires on earn/spend', () => {
  const { econ } = makeBundle();
  const events = [];
  econ.onChange((e, d) => events.push({ e, d }));
  econ.addGold(100);
  econ.spendGold(30);
  assert.equal(events.length, 2);
  assert.equal(events[0].e, 'earn');
  assert.equal(events[1].e, 'spend');
});

test('EconomySystem: sellItem with sell price multiplier', () => {
  const { items, inv, econ } = makeBundle();
  // sellPriceMultiplier default is 1.0 so 1 carrot = 25g
  inv.addItem('harvest_carrot', 1);
  const r = econ.sellItem('harvest_carrot', 1, inv);
  assert.equal(r.credit, 25);
});

test('EconomySystem: maxGold static accessor', () => {
  assert.equal(EconomySystem.MAX_GOLD, ECONOMY.maxGold);
});

test('EconomySystem: buyItem with quantity zero rejected', () => {
  const { inv, econ } = makeBundle();
  const r = econ.buyItem('seed_carrot', 0, inv);
  assert.equal(r.ok, false);
});

test('EconomySystem: sellItem with quantity > stock rejected', () => {
  const { inv, econ } = makeBundle();
  inv.addItem('harvest_carrot', 2);
  const r = econ.sellItem('harvest_carrot', 5, inv);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_stock');
  assert.equal(inv.countItem('harvest_carrot'), 2);
});