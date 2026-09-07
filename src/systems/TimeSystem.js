import { TIME, TIME_OF_DAY } from '../config/constants.js';

export class TimeSystem {
  constructor() {
    this.currentDay = TIME.startDay;
    this.currentTime = TIME.startTime;
    this.gameStartedDay = TIME.startDay;
    this.lastTickReal = 0;
    this.tickCount = 0;
    this._listeners = new Set();
    this.paused = false;
  }

  static get DAY_MS() {
    return TIME.realMsPerGameDay;
  }

  get isPaused() {
    return this.paused;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.lastTickReal = 0;
  }

  reset() {
    this.currentDay = TIME.startDay;
    this.currentTime = TIME.startTime;
    this.gameStartedDay = TIME.startDay;
    this.lastTickReal = 0;
    this.tickCount = 0;
    this._notify('reset');
  }

  advanceDays(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    this.currentDay += Math.floor(n);
    this._notify('day_change', { day: this.currentDay, source: 'manual' });
  }

  setTime(timeOfDay) {
    const phase = TIME.phases.find(p => p.id === timeOfDay);
    if (!phase) return false;
    this.currentTime = (phase.from + phase.to) / 2;
    this._notify('time_change', { time: this.currentTime, phase: phase.id });
    return true;
  }

  update(deltaMs) {
    if (this.paused) return;
    if (!this.lastTickReal) {
      this.lastTickReal = Date.now();
    }
    const dt = Date.now() - this.lastTickReal;
    if (dt < TIME.tickMs) return;
    this.lastTickReal = Date.now();
    this._advance(dt);
  }

  _advance(deltaMs) {
    const prevDay = this.currentDay;
    const prevTime = this.currentTime;
    const prevPhase = this.getPhase();

    const increment = deltaMs / TIME.realMsPerGameDay;
    this.currentTime += increment;
    this.tickCount++;

    let dayChanged = false;
    while (this.currentTime >= 1) {
      this.currentTime -= 1;
      this.currentDay += 1;
      dayChanged = true;
    }
    if (this.currentTime < 0) this.currentTime = 0;

    if (dayChanged && this.currentDay !== prevDay) {
      this._notify('day_change', { day: this.currentDay, prevDay });
    }
    const newPhase = this.getPhase();
    if (newPhase !== prevPhase) {
      this._notify('time_change', { time: this.currentTime, phase: newPhase });
    }
    if (Math.floor(this.currentTime * 100) !== Math.floor(prevTime * 100)) {
      this._notify('tick', { day: this.currentDay, time: this.currentTime });
    }
  }

  getPhase() {
    for (const p of TIME.phases) {
      if (this.currentTime >= p.from && this.currentTime < p.to) return p.id;
    }
    return TIME_OF_DAY.NIGHT;
  }

  getPhaseLabel() {
    const p = TIME.phases.find(p => p.id === this.getPhase());
    return p ? p.label : 'Unknown';
  }

  getHours() {
    const base = 6;
    const range = 18;
    return Math.floor(base + this.currentTime * range);
  }

  getFormattedTime() {
    const h = this.getHours();
    const m = Math.floor((this.currentTime * 18 * 60) % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  getFormattedDate() {
    return `Day ${this.currentDay} • ${this.getPhaseLabel()} ${this.getFormattedTime()}`;
  }

  snapshot() {
    return {
      currentDay: this.currentDay,
      currentTime: this.currentTime,
      gameStartedDay: this.gameStartedDay,
      tickCount: this.tickCount
    };
  }

  restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (Number.isFinite(snapshot.currentDay) && snapshot.currentDay >= 1) {
      this.currentDay = Math.floor(snapshot.currentDay);
    }
    if (Number.isFinite(snapshot.currentTime)) {
      this.currentTime = Math.max(0, Math.min(0.999, snapshot.currentTime));
    }
    if (Number.isFinite(snapshot.gameStartedDay) && snapshot.gameStartedDay >= 1) {
      this.gameStartedDay = Math.floor(snapshot.gameStartedDay);
    }
    if (Number.isFinite(snapshot.tickCount)) {
      this.tickCount = Math.floor(snapshot.tickCount);
    }
    this.lastTickReal = 0;
    this._notify('restore');
    return true;
  }

  isDay() {
    const p = this.getPhase();
    return p === TIME_OF_DAY.MORNING || p === TIME_OF_DAY.NOON
      || p === TIME_OF_DAY.AFTERNOON;
  }

  isNight() {
    return this.getPhase() === TIME_OF_DAY.NIGHT;
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(event, data = null) {
    for (const fn of this._listeners) {
      try { fn(event, data); } catch (e) { /* noop */ }
    }
  }
}