export const TILE_SIZE = 16;

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

export const DEFAULT_FONT = 'monospace';

export const COLORS = {
  background: 0x2d2a23,
  grass: 0x7ec850,
  water: 0x6cc8e8,
  text: 0xffffff
};

export const SCENE_KEYS = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  MAIN_MENU: 'MainMenuScene',
  FARM: 'FarmScene',
  FOREST: 'ForestScene',
  LAKE: 'LakeScene',
  UI: 'UIScene'
};

export const ASSET_PATHS = {
  tilesets: {
    grass: 'assets/images/tilesets/grass.png',
    dirt: 'assets/images/tilesets/dirt.png',
    water: 'assets/images/tilesets/water.png'
  },
  objects: {
    house: 'assets/images/objects/house.png',
    fences: 'assets/images/objects/fences.png',
    furniture: 'assets/images/objects/furniture.png'
  },
  characters: {
    player: 'assets/images/characters/player/player.png'
  },
  farming: {
    plants: 'assets/images/farming/plants.png',
    plantsWatered: 'assets/images/farming/plants_watered.png',
    items: 'assets/images/farming/crop_items.png'
  },
  fishing: {
    rod: 'assets/images/fishing/rod.png',
    fishSheet: 'assets/images/fishing/fish_sheet.png'
  },
  ui: {
    inventoryBlocks: 'assets/images/ui/inventory/inventory_blocks.png',
    emojiSheet: 'assets/images/ui/emoji_sheet.png'
  }
};

export const FARM_WORLD = {
  width: 30,
  height: 20,
  spawn: { x: 15, y: 10 }
};

export const LAKE_WORLD = {
  width: 30,
  height: 20,
  spawn: { x: 15, y: 5 },
  waterArea: {
    x0: 4,
    y0: 6,
    x1: 25,
    y1: 18
  },
  shoreTiles: [
    { tx: 2, ty: 8 },
    { tx: 2, ty: 12 },
    { tx: 2, ty: 16 }
  ],
  portalTile: { tx: 27, ty: 5, target: SCENE_KEYS.FARM }
};

export const FARMING = {
  plotsArea: {
    x0: 18,
    y0: 5,
    x1: 24,
    y1: 9
  },
  growthTickMs: 1000,
  stagesPerCrop: 4,
  growthStageFrames: 6,
  actionRangeTiles: 1.5,
  growthSpeedByPhase: {
    morning: 1.2,
    noon: 1.0,
    afternoon: 1.0,
    evening: 0.8,
    night: 0.3
  }
};

export const FISHING = {
  waterRangeTiles: 1.5,
  castDurationMs: 800,
  waitMinMs: 1500,
  waitMaxMs: 4000,
  bobFrequencyMs: 400,
  catchCooldownMs: 250
};

export const INVENTORY = {
  capacity: 24,
  cols: 6,
  rows: 4,
  toggleKey: 'I',
  slotSize: 32,
  slotPadding: 3,
  panelPadding: 8,
  defaultSelectedSlot: 0
};

export const TILE_GRASS = 0;
export const TILE_DIRT = 1;
export const TILE_WATER = 2;

export const SOIL_STATE = {
  GRASS: 'grass',
  TILLED: 'tilled',
  TILLED_WATERED: 'tilled_watered',
  PLANTED: 'planted',
  PLANTED_WATERED: 'planted_watered'
};

export const TOOLS = {
  NONE: 'none',
  HOE: 'hoe',
  WATERING_CAN: 'watering_can',
  SEED: 'seed',
  HAND: 'hand',
  ROD: 'rod'
};

export const CROP_LAYOUT = {
  carrot: { row: 2, stages: 4, cols: [1, 2, 3, 5] },
  tomato: { row: 4, stages: 4, cols: [1, 2, 3, 5] },
  strawberry: { row: 11, stages: 4, cols: [1, 2, 3, 5] }
};

export const ITEM_CATEGORIES = ['seed', 'crop', 'material', 'fish', 'tool', 'decoration'];

export const FISH_SHEET_COLS = 10;
export const FISH_SHEET_ROWS = 5;

export const SHARED_INVENTORY_KEY = '__sproutValleyShared';

export const STARTING_SEEDS = [
  { id: 'seed_carrot', quantity: 5 },
  { id: 'seed_tomato', quantity: 3 },
  { id: 'seed_strawberry', quantity: 2 }
];

export const DECORATION = {
  buildModeKey: 'B',
  removeModeKey: 'R',
  maxDecorations: 200,
  invalidTileStates: ['water', 'tilled', 'tilled_watered', 'planted', 'planted_watered'],
  defaultDisplaySize: 32,
  categories: ['decoration'],
  collisionTiles: ['water']
};

export const SHARED_DECORATION_KEY = '__sproutValleyDecoration';

export const TIME_OF_DAY = {
  MORNING: 'morning',
  NOON: 'noon',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  NIGHT: 'night'
};

export const TIME = {
  realMsPerGameDay: 720000,
  tickMs: 1000,
  phases: [
    { id: TIME_OF_DAY.MORNING, from: 0.0, to: 0.2, label: 'Morning' },
    { id: TIME_OF_DAY.NOON, from: 0.2, to: 0.45, label: 'Noon' },
    { id: TIME_OF_DAY.AFTERNOON, from: 0.45, to: 0.7, label: 'Afternoon' },
    { id: TIME_OF_DAY.EVENING, from: 0.7, to: 0.85, label: 'Evening' },
    { id: TIME_OF_DAY.NIGHT, from: 0.85, to: 1.0, label: 'Night' }
  ],
  startDay: 1,
  startTime: 0.05,
  pausedInMenus: true
};

export const TIME_TICK_RATE = 1;

export const ECONOMY = {
  startingGold: 100,
  maxGold: 999999,
  shopToggleKey: 'P',
  sellPriceMultiplier: 1.0,
  buyPriceMultiplier: 1.0,
  categories: ['seed', 'crop', 'fish', 'decoration'],
  sellableCategories: ['crop', 'fish']
};

export const SHARED_ECONOMY_KEY = '__sproutValleyEconomy';

export const NPC = {
  interactRangeTiles: 1.5,
  defaultAvailablePhases: ['morning', 'noon', 'afternoon', 'evening', 'night'],
  pageAdvanceKey: 'ENTER',
  pageCloseKey: 'ESC',
  interactKey: 'E',
  maxNpcs: 20,
  portraitSize: 32
};

export const QUEST = {
  maxQuestsActive: 5,
  objectiveTypes: ['harvest', 'catch_fish', 'place_decoration', 'earn_gold', 'talk_to_npc'],
  rewardTypes: ['gold', 'item'],
  states: ['available', 'active', 'completed', 'failed']
};

export const SHARED_NPC_KEY = '__sproutValleyNpc';
export const SHARED_QUEST_KEY = '__sproutValleyQuest';

export const ACHIEVEMENT = {
  maxAchievements: 100,
  triggerTypes: ['harvest', 'catch_fish', 'place_decoration', 'earn_gold', 'complete_quest'],
  states: ['locked', 'unlocked'],
  rewardReasons: {
    gold: 'achievement:gold'
  }
};

export const SHARED_ACHIEVEMENT_KEY = '__sproutValleyAchievement';

export const SCENE_NPC_SPRITE = {
  farmer: {
    sheet: 'ui_emoji_sheet',
    col: 0,
    row: 4
  },
  merchant: {
    sheet: 'ui_emoji_sheet',
    col: 2,
    row: 4
  },
  fisher: {
    sheet: 'ui_emoji_sheet',
    col: 3,
    row: 4
  }
};
