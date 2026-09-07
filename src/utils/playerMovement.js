export function normalizeDirection(direction = {}) {
  if (!direction || typeof direction !== 'object') return { x: 0, y: 0 };
  const x = Number.isFinite(direction.x) ? direction.x : Number(!!direction.right) - Number(!!direction.left);
  const y = Number.isFinite(direction.y) ? direction.y : Number(!!direction.down) - Number(!!direction.up);
  const length = Math.hypot(x, y);
  const divisor = Math.max(1, length);
  return { x: x / divisor, y: y / divisor };
}

export function movementVelocity(keyboard, touch, speed, enabled = true) {
  if (!enabled) return { x: 0, y: 0 };
  const keys = normalizeDirection(keyboard);
  const direction = keys.x || keys.y ? keys : normalizeDirection(touch);
  return { x: direction.x * speed, y: direction.y * speed };
}

export function facingDirection(velocity, previous = 'down') {
  if (!velocity.x && !velocity.y) return previous;
  if (Math.abs(velocity.x) > Math.abs(velocity.y)) return velocity.x > 0 ? 'right' : 'left';
  return velocity.y > 0 ? 'down' : 'up';
}
