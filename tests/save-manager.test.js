import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager, InMemoryStorage } from '../src/utils/SaveManager.js';

test('SaveManager: returns false when no storage is available', () => {
  const m = new SaveManager(null);
  assert.equal(m.isAvailable(), false);
  assert.equal(m.save('x', { a: 1 }), false);
  assert.equal(m.load('x'), null);
  assert.equal(m.has('x'), false);
  assert.equal(m.remove('x'), false);
});

test('SaveManager: in-memory storage roundtrip', () => {
  const m = new SaveManager(new InMemoryStorage());
  assert.equal(m.isAvailable(), true);
  assert.equal(m.save('game', { level: 1, hp: 100 }), true);
  assert.equal(m.has('game'), true);
  const data = m.load('game');
  assert.deepEqual(data, { level: 1, hp: 100 });
});

test('SaveManager: prefixed keys do not collide', () => {
  const store = new InMemoryStorage();
  store.setItem('other_key', '123');
  const m = new SaveManager(store);
  m.save('game', { x: 1 });
  assert.equal(store.getItem('other_key'), '123');
  assert.ok(store.getItem('sproutvalley_game'));
});

test('SaveManager: corrupt JSON returns null without throwing', () => {
  const store = new InMemoryStorage();
  store.setItem('sproutvalley_game', '{not valid json');
  const m = new SaveManager(store);
  assert.doesNotThrow(() => m.load('game'));
  assert.equal(m.load('game'), null);
});

test('SaveManager: clear removes all sproutvalley_ prefixed keys only', () => {
  const store = new InMemoryStorage();
  store.setItem('sproutvalley_a', '1');
  store.setItem('sproutvalley_b', '2');
  store.setItem('keep_me', '3');
  const m = new SaveManager(store);
  assert.equal(m.clear(), true);
  assert.equal(store.getItem('sproutvalley_a'), null);
  assert.equal(store.getItem('sproutvalley_b'), null);
  assert.equal(store.getItem('keep_me'), '3');
});