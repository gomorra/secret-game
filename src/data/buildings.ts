import type { GoodAmounts, GoodId } from './goods';
import { Terrain } from '../sim/map';

export type BuildingId = 'road' | 'warehouse' | 'house' | 'lantern' | 'woodcutter' | 'sawmill' | 'fishery';

export type BuildingCategory = 'infrastructure' | 'housing' | 'production' | 'light';

export interface ProductionDef {
  inputs: GoodAmounts;
  output: GoodId;
  amount: number;
  /** Seconds per cycle at full efficiency. */
  cycle: number;
}

/** A building that harvests nearby terrain. Efficiency = matching tiles in radius / ideal. */
export interface ResourceDef {
  terrain: readonly Terrain[];
  radius: number;
  ideal: number;
  label: string;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  category: BuildingCategory;
  size: readonly [number, number];
  color: number;
  glyph: string;
  cost: { coins: number; goods: GoodAmounts };
  /** Coins per minute. */
  upkeep: number;
  /** False for things the player can't place or remove (e.g. the Last Lantern). */
  playerBuildable: boolean;
  hotkey?: string;
  production?: ProductionDef;
  resource?: ResourceDef;
  /** Extra storage per good this building adds. */
  storage?: number;
}

const defs: BuildingDef[] = [
  {
    id: 'road',
    name: 'Road',
    description: 'Connects buildings to a warehouse. Drag to build a path.',
    category: 'infrastructure',
    size: [1, 1],
    color: 0x6b5a43,
    glyph: '',
    cost: { coins: 2, goods: {} },
    upkeep: 0,
    playerBuildable: true,
    hotkey: 'r',
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    description: 'Stores goods. Every building must be connected to one by road.',
    category: 'infrastructure',
    size: [2, 2],
    color: 0x7a5c3a,
    glyph: 'W',
    cost: { coins: 250, goods: { wood: 10, planks: 6 } },
    upkeep: 2,
    playerBuildable: true,
    storage: 60,
  },
  {
    id: 'house',
    name: 'House',
    description: 'Home for castaways. They pay tax while they have fish and wood.',
    category: 'housing',
    size: [2, 2],
    color: 0x8c6d4f,
    glyph: 'H',
    cost: { coins: 0, goods: { wood: 3 } },
    upkeep: 0,
    playerBuildable: true,
    hotkey: 'h',
  },
  {
    id: 'lantern',
    name: 'The Last Lantern',
    description: 'Your first light. It has burned since you landed and never needs fuel.',
    category: 'light',
    size: [1, 1],
    color: 0xffc46b,
    glyph: '✦',
    cost: { coins: 0, goods: {} },
    upkeep: 0,
    playerBuildable: false,
  },
  {
    id: 'woodcutter',
    name: 'Woodcutter',
    description: 'Fells nearby trees for wood. Works best surrounded by forest.',
    category: 'production',
    size: [2, 2],
    color: 0x4f7a3a,
    glyph: 'Wc',
    cost: { coins: 50, goods: { wood: 2 } },
    upkeep: 4,
    playerBuildable: true,
    production: { inputs: {}, output: 'wood', amount: 1, cycle: 12 },
    resource: { terrain: [Terrain.Forest], radius: 3, ideal: 16, label: 'forest' },
  },
  {
    id: 'sawmill',
    name: 'Sawmill',
    description: 'Cuts wood into planks.',
    category: 'production',
    size: [2, 2],
    color: 0xb08a55,
    glyph: 'Sm',
    cost: { coins: 120, goods: { wood: 6 } },
    upkeep: 8,
    playerBuildable: true,
    production: { inputs: { wood: 1 }, output: 'planks', amount: 1, cycle: 15 },
  },
  {
    id: 'fishery',
    name: 'Fishery',
    description: 'Catches fish. Must be built by open water.',
    category: 'production',
    size: [2, 2],
    color: 0x3f6f8c,
    glyph: 'F',
    cost: { coins: 80, goods: { wood: 3, planks: 2 } },
    upkeep: 5,
    playerBuildable: true,
    production: { inputs: {}, output: 'fish', amount: 1, cycle: 10 },
    resource: { terrain: [Terrain.Water], radius: 2, ideal: 8, label: 'open water' },
  },
];

export const BUILDINGS = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<BuildingId, BuildingDef>;
export const BUILDING_LIST: readonly BuildingDef[] = defs;
