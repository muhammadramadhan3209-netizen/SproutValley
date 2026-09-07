export function staticRectangle(scene, x, y, width, height, group = null) {
  // Zones have explicit dimensions. Refreshing a texture-less static image
  // previously replaced the requested collider size with its default texture size.
  const zone = scene.add.zone(x, y, width, height);
  scene.physics.add.existing(zone, true);
  if (group) group.add(zone);
  return zone;
}

export function restoreWalkablePosition(scene, position, spawn) {
  const player = scene.player;
  const target = position || spawn;
  player.body.reset(target.x, target.y);
  const body = player.body;
  // Arcade reset() initially positions at sprite top-left. Apply the feet
  // offset before checking solids/portals, without waiting for the first step.
  body.updateFromGameObject();
  const bounds = scene.physics.world.bounds;
  const overlaps = solid => solid?.body &&
    body.left < solid.body.right && body.right > solid.body.left &&
    body.top < solid.body.bottom && body.bottom > solid.body.top;
  const blocked = body.left < bounds.left || body.right > bounds.right ||
    body.top < bounds.top || body.bottom > bounds.bottom ||
    scene.solids.getChildren().some(overlaps) || overlaps(scene.portalTrigger);
  if (blocked) {
    body.reset(spawn.x, spawn.y);
    body.updateFromGameObject();
  }
  player.setVelocity(0, 0);
  scene.cameras.main.centerOn(player.x, player.y);
}
