// Measured from the bundled PNGs. All frame indices are zero-based.
export const SHEETS = {
  player: { width: 128, height: 48, frameWidth: 16, frameHeight: 16 },
  tileset_grass: { width: 160, height: 128, frameWidth: 16, frameHeight: 16 },
  tileset_dirt: { width: 128, height: 128, frameWidth: 16, frameHeight: 16 },
  tileset_water: { width: 64, height: 16, frameWidth: 16, frameHeight: 16 },
  object_house: { width: 112, height: 80, frameWidth: 16, frameHeight: 16 },
  plants_dry: { width: 112, height: 528, frameWidth: 16, frameHeight: 16 },
  plants_watered: { width: 112, height: 528, frameWidth: 16, frameHeight: 16 },
  crop_items: { width: 80, height: 224, frameWidth: 16, frameHeight: 16 },
  fish_sheet: { width: 160, height: 80, frameWidth: 16, frameHeight: 16 },
  ui_inventory_blocks: { width: 144, height: 144, frameWidth: 48, frameHeight: 48 },
  ui_emoji_sheet: { width: 160, height: 608, frameWidth: 32, frameHeight: 32 },
  object_fences: { width: 64, height: 64, frameWidth: 16, frameHeight: 16 },
  object_furniture: { width: 144, height: 96, frameWidth: 16, frameHeight: 16 }
};

export const PLAYER_SPEED = 80;
export const PLAYER_BODY = { width: 8, height: 4, offsetX: 4, offsetY: 12 };
// teemo 8 directions.png: back, back-left, left, front-left, front,
// front-right, right, back-right. Rows: step A, rest, step B.
export const PLAYER_DIRECTIONS = { down: 4, up: 0, left: 2, right: 6 };

export function playerAnimationDefinitions(texture = 'player') {
  return Object.entries(PLAYER_DIRECTIONS).flatMap(([direction, column]) => [
    { key: `player_idle_${direction}`, frames: [{ key: texture, frame: column + 8 }], frameRate: 1 },
    {
      key: `player_walk_${direction}`,
      frames: [column, column + 8, column + 16, column + 8].map(frame => ({ key: texture, frame })),
      frameRate: 8,
      repeat: -1
    }
  ]);
}

export function sheetColumns(key) {
  const sheet = SHEETS[key];
  return sheet ? sheet.width / sheet.frameWidth : 1;
}

export function groundFrame(tile, tx, ty) {
  if (tile === 2) return 0; // Water.png is a four-frame animation strip.
  if (tile === 1) return 0; // Opaque dirt centre, not an edge or transparent cell.
  return (tx * 17 + ty * 31) % 3; // Three opaque grass variants.
}

// The existing seven-by-five house footprint, assembled from Wooden House.png.
// Same 7x5 roof and 7x4 wall layout as the bundled Godot harvest_hill_example.
export const HOUSE_LAYERS = [
  { y: 1, rows: [[7, 8, 8, 8, 8, 8, 9], [14, 15, 15, 15, 15, 15, 16],
    [14, 15, 15, 15, 15, 15, 16], [21, 1, 22, 1, 10, 1, 23]] },
  { y: 0, rows: [[4, 5, 5, 5, 5, 5, 6], [11, 12, 12, 12, 12, 12, 13],
    [18, 19, 19, 19, 19, 19, 20], [25, 26, 26, 26, 26, 26, 27], [32, 33, 33, 33, 33, 33, 34]] }
];
