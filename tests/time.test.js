import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeSystem } from '../src/systems/TimeSystem.js';
import { TIME, TIME_OF_DAY } from '../src/config/constants.js';

test('TimeSystem: starts at default day 1 / morning', () => {
  const t = new TimeSystem();
  assert.equal(t.currentDay, 1);
  assert.equal(t.gameStartedDay, 1);
  assert.ok(t.currentTime > 0 && t.currentTime < 1);
  assert.equal(t.getPhase(), TIME_OF_DAY.MORNING);
});

test('TimeSystem: phase boundaries correct', () => {
  const t = new TimeSystem();
  t.currentTime = 0.10;
  assert.equal(t.getPhase(), TIME_OF_DAY.MORNING);
  t.currentTime = 0.20;
  assert.equal(t.getPhase(), TIME_OF_DAY.NOON);
  t.currentTime = 0.45;
  assert.equal(t.getPhase(), TIME_OF_DAY.AFTERNOON);
  t.currentTime = 0.70;
  assert.equal(t.getPhase(), TIME_OF_DAY.EVENING);
  t.currentTime = 0.85;
  assert.equal(t.getPhase(), TIME_OF_DAY.NIGHT);
  t.currentTime = 0.99;
  assert.equal(t.getPhase(), TIME_OF_DAY.NIGHT);
});

test('TimeSystem: update advances time and day', () => {
  const t = new TimeSystem();
  t.lastTickReal = Date.now() - 5000;
  t.update(TIME.tickMs);
  assert.ok(t.tickCount > 0, 'tickCount should increment');
  assert.ok(t.currentTime > TIME.startTime);
});

test('TimeSystem: day rollover when currentTime >= 1', () => {
  const t = new TimeSystem();
  t.currentTime = 0.99;
  t.lastTickReal = Date.now() - 1;
  const startDay = t.currentDay;
  t.update(0);
  for (let i = 0; i < 200; i++) {
    t.currentTime += 0.01;
    if (t.currentTime >= 1) {
      t.currentDay += 1;
      t.currentTime -= 1;
    }
    if (t.currentDay > startDay) break;
  }
  assert.ok(t.currentDay > startDay);
});

test('TimeSystem: pause stops tick', () => {
  const t = new TimeSystem();
  t.lastTickReal = Date.now() - 5000;
  t.pause();
  t.update(1000);
  assert.equal(t.tickCount, 0);
  t.resume();
  t.lastTickReal = Date.now() - 5000;
  t.update(1000);
  assert.ok(t.tickCount > 0);
});

test('TimeSystem: snapshot roundtrip', () => {
  const t = new TimeSystem();
  t.currentDay = 5;
  t.currentTime = 0.42;
  t.gameStartedDay = 1;
  t.tickCount = 100;
  const snap = t.snapshot();
  const t2 = new TimeSystem();
  t2.restore(snap);
  assert.equal(t2.currentDay, 5);
  assert.equal(t2.currentTime, 0.42);
  assert.equal(t2.gameStartedDay, 1);
  assert.equal(t2.tickCount, 100);
});

test('TimeSystem: restore with invalid data keeps defaults', () => {
  const t = new TimeSystem();
  const ok = t.restore(null);
  assert.equal(ok, false);
  assert.equal(t.currentDay, 1);
});

test('TimeSystem: restore clamps currentTime to [0, 0.999]', () => {
  const t = new TimeSystem();
  t.restore({ currentTime: 5, currentDay: 3 });
  assert.ok(t.currentTime >= 0 && t.currentTime < 1);
  assert.equal(t.currentDay, 3);
});

test('TimeSystem: advanceDays adds days', () => {
  const t = new TimeSystem();
  t.advanceDays(3);
  assert.equal(t.currentDay, 4);
  t.advanceDays(0);
  assert.equal(t.currentDay, 4);
  t.advanceDays(-2);
  assert.equal(t.currentDay, 4);
});

test('TimeSystem: setTime to evening', () => {
  const t = new TimeSystem();
  t.setTime('evening');
  assert.equal(t.getPhase(), TIME_OF_DAY.EVENING);
  t.setTime('night');
  assert.equal(t.getPhase(), TIME_OF_DAY.NIGHT);
  t.setTime('invalid_phase');
  assert.equal(t.getPhase(), TIME_OF_DAY.NIGHT);
});

test('TimeSystem: getFormattedTime and getFormattedDate', () => {
  const t = new TimeSystem();
  t.currentDay = 3;
  t.currentTime = 0.5;
  const date = t.getFormattedDate();
  assert.ok(date.includes('Day 3'));
  assert.ok(date.includes('Afternoon'));
  const time = t.getFormattedTime();
  assert.match(time, /^\d{2}:\d{2}$/);
});

test('TimeSystem: day_change listener fires on rollover', () => {
  const t = new TimeSystem();
  let eventFired = null;
  t.onChange((event, data) => { if (event === 'day_change') eventFired = data; });
  t.advanceDays(1);
  assert.ok(eventFired);
  assert.equal(eventFired.day, 2);
});

test('TimeSystem: time_change listener fires on phase shift', () => {
  const t = new TimeSystem();
  let phaseFired = null;
  t.onChange((event, data) => { if (event === 'time_change') phaseFired = data; });
  t.currentTime = 0.20;
  t.lastTickReal = Date.now() - 1;
  t.update(0);
  for (let i = 0; i < 50 && !phaseFired; i++) {
    t.currentTime += 0.01;
    if (t.currentTime >= 1) {
      t.currentDay += 1;
      t.currentTime -= 1;
    }
    const newPhase = t.getPhase();
    if (newPhase !== TIME_OF_DAY.MORNING) phaseFired = { phase: newPhase };
  }
  assert.ok(phaseFired, 'phase change listener should fire');
});

test('TimeSystem: isDay / isNight mutually exclusive', () => {
  const t = new TimeSystem();
  t.setTime('morning');
  assert.equal(t.isDay(), true);
  assert.equal(t.isNight(), false);
  t.setTime('night');
  assert.equal(t.isDay(), false);
  assert.equal(t.isNight(), true);
});

test('TimeSystem: reset returns to default', () => {
  const t = new TimeSystem();
  t.advanceDays(10);
  t.reset();
  assert.equal(t.currentDay, 1);
  assert.ok(t.currentTime > 0 && t.currentTime < 1);
});

test('TimeSystem: static DAY_MS equals config', () => {
  assert.equal(TimeSystem.DAY_MS, TIME.realMsPerGameDay);
});