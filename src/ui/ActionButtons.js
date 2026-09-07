import { TouchButtons } from './TouchButtons.js';

export const FARM_ACTION_DEFS = [
  { id: 'hoe', label: 'Q', sublabel: 'Hoe', color: 0xb9a779 },
  { id: 'water', label: 'T', sublabel: 'Water', color: 0x6cc8e8 },
  { id: 'harvest', label: 'Spc', sublabel: 'Pick', color: 0xffd700 },
  { id: 'interact', label: 'E', sublabel: 'Use', color: 0x9bd07a },
  { id: 'seed_cycle', label: 'Seed', sublabel: 'Seed', color: 0xb19cd9 },
  { id: 'build_cycle', label: 'Item', sublabel: 'Item', color: 0xffc080 },
  { id: 'shop', label: 'P', sublabel: 'Shop', color: 0xff8866 }
];

export const LAKE_ACTION_DEFS = [
  { id: 'cast', label: 'F', sublabel: 'Cast', color: 0x6cc8e8 },
  { id: 'catch', label: 'Spc', sublabel: 'Catch', color: 0xffd700 },
  { id: 'interact', label: 'E', sublabel: 'Talk', color: 0x9bd07a }
];

export const FARM_SEED_CYCLE = ['carrot', 'tomato', 'strawberry'];
export const FARM_BUILD_CYCLE = [
  'decoration_wood_fence',
  'decoration_wooden_chair',
  'decoration_flower_pot',
  'decoration_lamp',
  'decoration_stone_path'
];

export class ActionButtons extends TouchButtons {
  constructor(scene, options = {}) {
    super(scene, {
      defs: options.defs || FARM_ACTION_DEFS,
      onPress: options.onPress || (() => {})
    });
  }
}