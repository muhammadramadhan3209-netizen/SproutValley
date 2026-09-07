import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NPCSystem } from '../src/systems/NPCSystem.js';
import { TimeSystem } from '../src/systems/TimeSystem.js';
import { TILE_SIZE } from '../src/config/constants.js';

function makeMockScene(sceneKey) {
  const imageStore = new Map();
  return {
    add: {
      image: (x, y, sheet, frame) => {
        const key = `${sheet}_${frame}`;
        if (!imageStore.has(key)) {
          const obj = {
            x, y, sheet, frame,
            _alpha: 1,
            setOrigin() { return obj; },
            setDisplaySize() { return obj; },
            setDepth() { return obj; },
            setTexture(s, f) { obj.sheet = s; obj.frame = f; return obj; },
            setVisible() { return obj; },
            setAlpha(v) { obj._alpha = v; return obj; },
            setPosition() { return obj; },
            destroy() {}
          };
          imageStore.set(key, obj);
        }
        return imageStore.get(key);
      }
    },
    scene: { key: sceneKey || 'FarmScene' }
  };
}

test('NPCSystem: spawnAll creates registered NPCs', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const list = npcs.getAll();
  assert.ok(list.length >= 2);
  const names = list.map(n => n.name);
  assert.ok(names.includes('Farmer Ada'));
  assert.ok(names.includes('Merchant Tom'));
});

test('NPCSystem: spawn filters by scene', () => {
  const scene = makeMockScene('LakeScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const list = npcs.getAll();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Fisher Jo');
});

test('NPCSystem: isAvailable respects time phase', () => {
  const scene = makeMockScene('FarmScene');
  const time = new TimeSystem();
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  time.setTime('night');
  for (const n of npcs.getAll()) {
    assert.equal(npcs.isAvailable(n.id), false);
  }
  time.setTime('morning');
  for (const n of npcs.getAll()) {
    assert.equal(npcs.isAvailable(n.id), true);
  }
});

test('NPCSystem: LakeScene only has fisher at night', () => {
  const scene = makeMockScene('LakeScene');
  const time = new TimeSystem();
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  time.setTime('night');
  for (const n of npcs.getAll()) {
    if (n.id === 'fisher_jo') {
      assert.equal(npcs.isAvailable(n.id), false);
    }
  }
});

test('NPCSystem: getAt finds nearest NPC within range', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const ada = npcs.npcs['farmer_ada'];
  const playerX = ada.x;
  const playerY = ada.y;
  const found = npcs.getAt(playerX, playerY, 1.5);
  assert.ok(found);
  assert.equal(found.id, 'farmer_ada');
});

test('NPCSystem: getAt returns null when out of range', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const found = npcs.getAt(0, 0, 1);
  assert.equal(found, null);
});

test('NPCSystem: openDialog starts dialog state', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const r = npcs.openDialog('farmer_ada');
  assert.equal(r.ok, true);
  assert.equal(npcs.isDialogActive(), true);
  const cur = npcs.currentDialog();
  assert.equal(cur.npcId, 'farmer_ada');
  assert.ok(cur.text.length > 0);
});

test('NPCSystem: openDialog fails for unavailable NPC', () => {
  const scene = makeMockScene('FarmScene');
  const time = new TimeSystem();
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  time.setTime('night');
  const r = npcs.openDialog('farmer_ada');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_available');
});

test('NPCSystem: openDialog marks NPC as met', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  assert.equal(npcs.isMet('farmer_ada'), false);
  npcs.openDialog('farmer_ada');
  assert.equal(npcs.isMet('farmer_ada'), true);
});

test('NPCSystem: advanceDialog moves to next page', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  const r = npcs.advanceDialog();
  assert.equal(r.ok, true);
  assert.equal(r.closed, undefined);
  const cur = npcs.currentDialog();
  assert.equal(cur.pageId, 'trade');
});

test('NPCSystem: advanceDialog closes on last page', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  npcs.dialogState.pageId = 'bye';
  npcs.dialogState.advance = null;
  npcs.dialogState.choices = [];
  const r = npcs.advanceDialog();
  assert.equal(r.ok, true);
  assert.equal(r.closed, true);
  assert.equal(npcs.isDialogActive(), false);
});

test('NPCSystem: advanceDialog awaits choice', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  // Inject choices via direct manipulation
  npcs.openDialog('farmer_ada');
  npcs.advanceDialog();
  // Manually inject choices on current page
  npcs.dialogState.choices = [{ label: 'Test', next: null, effects: [{ type: 'close' }] }];
  const r = npcs.advanceDialog();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'awaiting_choice');
});

test('NPCSystem: chooseDialog selects choice & navigates', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  npcs.dialogState.choices = [
    { label: 'A', next: 'bye' },
    { label: 'B', effects: [{ type: 'close' }] }
  ];
  const r = npcs.chooseDialog(0);
  assert.equal(r.ok, true);
  // 'bye' is a closing page (no next, no choices) so dialog is now closed
  assert.equal(npcs.isDialogActive(), false);
});

test('NPCSystem: chooseDialog navigates to non-closing page', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  npcs.dialogState.choices = [
    { label: 'A', next: 'trade' }
  ];
  const r = npcs.chooseDialog(0);
  assert.equal(r.ok, true);
  assert.equal(npcs.isDialogActive(), true);
  const cur = npcs.currentDialog();
  assert.equal(cur.pageId, 'trade');
});

test('NPCSystem: chooseDialog close effect', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  npcs.dialogState.choices = [
    { label: 'A', next: 'bye' },
    { label: 'B', effects: [{ type: 'close' }] }
  ];
  const r = npcs.chooseDialog(1);
  assert.equal(r.closed, true);
  assert.equal(npcs.isDialogActive(), false);
});

test('NPCSystem: chooseDialog invalid index', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  npcs.dialogState.choices = [{ label: 'A' }];
  const r = npcs.chooseDialog(99);
  assert.equal(r.ok, false);
});

test('NPCSystem: closeDialog', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  assert.equal(npcs.isDialogActive(), true);
  assert.equal(npcs.closeDialog(), true);
  assert.equal(npcs.isDialogActive(), false);
});

test('NPCSystem: snapshot roundtrip preserves met & lastPage', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  npcs.openDialog('farmer_ada');
  npcs.advanceDialog();
  const snap = npcs.snapshot();
  const npcs2 = new NPCSystem(scene);
  npcs2.spawnAll();
  npcs2.restore(snap);
  assert.equal(npcs2.isMet('farmer_ada'), true);
  const lastPage = npcs2.presence['farmer_ada'].lastDialogPageId;
  assert.equal(lastPage, 'trade');
});

test('NPCSystem: restore with null keeps current state', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const ok = npcs.restore(null);
  assert.equal(ok, false);
});

test('NPCSystem: onChange listener fires on spawn', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  const events = [];
  npcs.onChange((e) => events.push(e));
  npcs.spawnAll();
  assert.ok(events.includes('spawn'));
});

test('NPCSystem: setQuestHandlers works', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  let started = null;
  let completed = null;
  npcs.setQuestHandlers({
    onStart: (id) => { started = id; },
    onComplete: (id) => { completed = id; }
  });
  npcs._onStartQuest('test_quest');
  npcs._onCompleteQuest('test_quest');
  assert.equal(started, 'test_quest');
  assert.equal(completed, 'test_quest');
});

test('NPCSystem: openDialog fails for unknown npc', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const r = npcs.openDialog('unknown_npc');
  assert.equal(r.ok, false);
});

test('NPCSystem: despawn removes npc', () => {
  const scene = makeMockScene('FarmScene');
  const npcs = new NPCSystem(scene);
  npcs.spawnAll();
  const before = npcs.getAll().length;
  npcs.despawn('farmer_ada');
  assert.equal(npcs.getAll().length, before - 1);
  assert.equal(npcs.npcs['farmer_ada'], undefined);
});

test('NPCSystem: time system update refreshes availability', () => {
  const scene = makeMockScene('FarmScene');
  const time = new TimeSystem();
  const npcs = new NPCSystem(scene, time);
  npcs.spawnAll();
  time.setTime('night');
  npcs.update(0, 0);
  for (const n of npcs.getAll()) {
    if (n.id === 'farmer_ada') {
      assert.equal(npcs.isAvailable(n.id), false);
    }
  }
});