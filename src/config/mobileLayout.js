import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';

export const TOUCH_SIZE = 32;
export const TOUCH_GAP = 5;
export const TOUCH_MARGIN = 10;
export const PAD_RADIUS = 36;

export function landscapeSize(width, height) {
  if (!(width > 0 && height > 0)) return { width: GAME_WIDTH, height: GAME_HEIGHT };
  const aspect = Math.max(4 / 3, Math.min(2.4, Math.max(width, height) / Math.min(width, height)));
  const w = Math.min(GAME_WIDTH, Math.floor(GAME_HEIGHT * aspect));
  return { width: w, height: Math.round(w / aspect) };
}

export function buttonPosition(index, width, height, { top = false, columns = 4, rowOffset = 0 } = {}) {
  const row = Math.floor(index / columns);
  return {
    x: width - TOUCH_MARGIN - TOUCH_SIZE / 2 - (index % columns) * (TOUCH_SIZE + TOUCH_GAP),
    y: top ? 52 + row * (TOUCH_SIZE + TOUCH_GAP)
      : height - TOUCH_MARGIN - TOUCH_SIZE / 2 - row * (TOUCH_SIZE + TOUCH_GAP) - rowOffset
  };
}

export function padPosition(height) {
  return { x: TOUCH_MARGIN + PAD_RADIUS + 6, y: height - TOUCH_MARGIN - PAD_RADIUS - 6 };
}
