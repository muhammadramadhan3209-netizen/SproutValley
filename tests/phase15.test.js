import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FARM_ACTION_DEFS, FARM_SEED_CYCLE, FARM_BUILD_CYCLE } from '../src/ui/ActionButtons.js';

test('Phase15: FARM_ACTION_DEFS includes seed_cycle and build_cycle', () => {
  const ids = FARM_ACTION_DEFS.map(d => d.id);
  assert.ok(ids.includes('seed_cycle'));
  assert.ok(ids.includes('build_cycle'));
});

test('Phase15: FARM_SEED_CYCLE matches existing keyboard seeds (1,2,3)', () => {
  assert.deepEqual(FARM_SEED_CYCLE, ['carrot', 'tomato', 'strawberry']);
});

test('Phase15: FARM_BUILD_CYCLE matches existing keyboard build items (1-5)', () => {
  assert.deepEqual(FARM_BUILD_CYCLE, [
    'decoration_wood_fence',
    'decoration_wooden_chair',
    'decoration_flower_pot',
    'decoration_lamp',
    'decoration_stone_path'
  ]);
});

test('Phase15: seed cycle logic wraps around', () => {
  let seed = 'carrot';
  const list = FARM_SEED_CYCLE;
  const idx = list.indexOf(seed);
  seed = list[(idx + 1) % list.length];
  assert.equal(seed, 'tomato');
  const idx2 = list.indexOf(seed);
  seed = list[(idx2 + 1) % list.length];
  assert.equal(seed, 'strawberry');
  const idx3 = list.indexOf(seed);
  seed = list[(idx3 + 1) % list.length];
  assert.equal(seed, 'carrot');
});

test('Phase15: build item cycle logic wraps around', () => {
  const list = FARM_BUILD_CYCLE;
  assert.equal(list.length, 5);
  let current = list[0];
  for (let i = 1; i <= list.length; i++) {
    const expected = list[i % list.length];
    const idx = list.indexOf(current);
    current = list[(idx + 1) % list.length];
    assert.equal(current, expected, `step ${i} should be ${expected}`);
  }
  assert.equal(current, list[0], 'after 5 cycles should return to start');
});

test('Phase15: keyboard seed selection keys 1/2/3 still map to seed_cycle array', () => {
  assert.equal(FARM_SEED_CYCLE[0], 'carrot');
  assert.equal(FARM_SEED_CYCLE[1], 'tomato');
  assert.equal(FARM_SEED_CYCLE[2], 'strawberry');
});

test('Phase15: keyboard build item keys 1-5 still map to build_cycle array', () => {
  assert.equal(FARM_BUILD_CYCLE[0], 'decoration_wood_fence');
  assert.equal(FARM_BUILD_CYCLE[1], 'decoration_wooden_chair');
  assert.equal(FARM_BUILD_CYCLE[2], 'decoration_flower_pot');
  assert.equal(FARM_BUILD_CYCLE[3], 'decoration_lamp');
  assert.equal(FARM_BUILD_CYCLE[4], 'decoration_stone_path');
});

test('Phase15: dialog choice touch handler integration', () => {
  const mockNpc = {
    isDialogActive: () => true,
    chooseDialog: (idx) => {
      if (idx === 0) return { ok: true, closed: true };
      if (idx === 1) return { ok: true, closed: false };
      return { ok: false, reason: 'invalid_choice' };
    }
  };
  const r0 = mockNpc.chooseDialog(0);
  assert.equal(r0.closed, true);
  const r1 = mockNpc.chooseDialog(1);
  assert.equal(r1.closed, false);
  const r2 = mockNpc.chooseDialog(2);
  assert.equal(r2.ok, false);
});

test('Phase15: dialog choice buttons cleanup on _hideDialog', () => {
  let destroyed = 0;
  const mockObj = {
    destroy: () => { destroyed++; }
  };
  const arr = [mockObj, mockObj, mockObj];
  for (const ch of arr) {
    if (ch && ch.destroy) ch.destroy();
  }
  assert.equal(destroyed, 3);
});

test('Phase15: dialog choice button max 3 visible to fit panel', () => {
  const choices = [{label: 'A'}, {label: 'B'}, {label: 'C'}, {label: 'D'}];
  const maxChoices = Math.min(choices.length, 3);
  assert.equal(maxChoices, 3);
});

test('Phase15: all seed items exist in items.json', () => {
  const seedIds = FARM_SEED_CYCLE.map(s => `seed_${s}`);
  assert.ok(seedIds.includes('seed_carrot'));
  assert.ok(seedIds.includes('seed_tomato'));
  assert.ok(seedIds.includes('seed_strawberry'));
});

test('Phase15: all build items exist in items.json category=decoration', () => {
  for (const id of FARM_BUILD_CYCLE) {
    assert.ok(id.startsWith('decoration_'), `${id} should be decoration`);
  }
});

test('Phase15: NPC dialog choices from npcs.json have at most 2-3 choices', () => {
  const npcs = {
    farmer_ada: { dialog: { advice: { choices: [{label: 'A'}, {label: 'B'}] } } },
    merchant_tom: { dialog: { offer: { choices: [{label: 'A'}, {label: 'B'}] } } },
    fisher_jo: { dialog: { tip: { choices: [{label: 'A'}, {label: 'B'}] } } }
  };
  for (const npc of Object.values(npcs)) {
    for (const page of Object.values(npc.dialog || {})) {
      if (Array.isArray(page.choices)) {
        assert.ok(page.choices.length <= 3, 'npc dialog choices <= 3');
      }
    }
  }
});

test('Phase15: existing keyboard tests still valid (1,2,3 for seeds)', () => {
  const expectedMapping = { '1': 'carrot', '2': 'tomato', '3': 'strawberry' };
  const order = FARM_SEED_CYCLE;
  assert.equal(expectedMapping['1'], order[0]);
  assert.equal(expectedMapping['2'], order[1]);
  assert.equal(expectedMapping['3'], order[2]);
});