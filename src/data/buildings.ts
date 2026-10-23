import type { GoodAmounts, GoodId } from './goods';
import { Terrain } from '../sim/map';

export type BuildingId =
  | 'road'
  | 'warehouse'
  | 'house'
  | 'lantern'
  | 'brazier'
  | 'lanternPost'
  | 'lighthouse'
  | 'shrine'
  | 'tavern'
  | 'archive'
  | 'woodcutter'
  | 'sawmill'
  | 'fishery'
  | 'quarry'
  | 'wheatFarm'
  | 'mill'
  | 'bakery'
  | 'whaler'
  | 'rendery'
  | 'apiary'
  | 'chandlery'
  | 'reedCutter'
  | 'paperMill'
  | 'inkBoat'
  | 'bookbinder';

export type BuildingCategory = 'infrastructure' | 'housing' | 'production' | 'light';

export interface ProductionDef {
  inputs: GoodAmounts;
  output: GoodId;
  amount: number;
  /** Seconds per cycle at full efficiency. */
  cycle: number;
}

/** A light source. Lit tiles are buildable and keep buildings working. */
export interface LightDef {
  /** Lit radius in tiles, measured from the building's centre. */
  radius: number;
  /** Good burned as fuel. No fuel means it burns forever. */
  fuel?: GoodId;
  /** Fuel units per minute. */
  burn: number;
  /** Explore radius as a multiple of the lit radius. */
  reveal?: number;
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
  /** Population tier that unlocks this building. */
  tier: number;
  /** Service buildings: houses within this many tiles get the service. */
  serviceRadius?: number;
  hotkey?: string;
  production?: ProductionDef;
  resource?: ResourceDef;
  light?: LightDef;
  /** Extra storage per good this building adds. */
  storage?: number;
}

type Def = Omit<BuildingDef, 'playerBuildable' | 'tier'> & { playerBuildable?: boolean; tier?: number };

const forest = [Terrain.Forest];
const water = [Terrain.Water];

const defs: Def[] = [
  // Infrastructure
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
    storage: 60,
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
    light: { radius: 8, burn: 0 },
  },
  {
    id: 'brazier',
    name: 'Brazier',
    description: 'An iron bowl of burning wood. Pushes the fog back a little.',
    category: 'light',
    size: [1, 1],
    color: 0x5a4a3a,
    glyph: '',
    cost: { coins: 30, goods: { wood: 3 } },
    upkeep: 1,
    hotkey: 'b',
    light: { radius: 5.5, fuel: 'wood', burn: 1.5 },
  },
  {
    id: 'lanternPost',
    name: 'Lantern post',
    description: 'A tall oil lamp. Lights a wider area than a brazier.',
    category: 'light',
    size: [1, 1],
    color: 0x4a4440,
    glyph: '',
    cost: { coins: 120, goods: { planks: 3, stone: 2 } },
    upkeep: 3,
    tier: 2,
    light: { radius: 8.5, fuel: 'lampOil', burn: 0.6 },
  },
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    description: 'A great beam over land and sea. Burns lots of lamp oil and reveals far across the water.',
    category: 'light',
    size: [2, 2],
    color: 0xd8d0c0,
    glyph: '',
    cost: { coins: 600, goods: { planks: 10, stone: 12 } },
    upkeep: 12,
    tier: 2,
    light: { radius: 14, fuel: 'lampOil', burn: 2.5, reveal: 1.8 },
  },

  // Housing and services
  {
    id: 'house',
    name: 'House',
    description: 'Home for your people. Full, content houses upgrade to the next tier once it is unlocked.',
    category: 'housing',
    size: [2, 2],
    color: 0x8c6d4f,
    glyph: 'H',
    cost: { coins: 0, goods: { wood: 3 } },
    upkeep: 0,
    hotkey: 'h',
  },
  {
    id: 'shrine',
    name: 'Shrine',
    description: 'A quiet place to light a candle for the lost. Castaways nearby pay more tax.',
    category: 'housing',
    size: [1, 1],
    color: 0x6d6a8a,
    glyph: 'S',
    cost: { coins: 120, goods: { wood: 4, planks: 2 } },
    upkeep: 4,
    serviceRadius: 6,
  },
  {
    id: 'tavern',
    name: 'Tavern',
    description: 'Warm light and loud songs. Lamplighters nearby pay more tax.',
    category: 'housing',
    size: [2, 2],
    color: 0x8a4a32,
    glyph: 'Tv',
    cost: { coins: 400, goods: { planks: 8, stone: 4 } },
    upkeep: 10,
    tier: 2,
    serviceRadius: 7,
  },
  {
    id: 'archive',
    name: 'Archive',
    description: 'Shelves of salvaged records. Scholars nearby pay more tax.',
    category: 'housing',
    size: [2, 2],
    color: 0x4a4f7a,
    glyph: 'Ar',
    cost: { coins: 900, goods: { planks: 10, stone: 10 } },
    upkeep: 20,
    tier: 3,
    serviceRadius: 8,
  },

  // Tier 1 production
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
    production: { inputs: {}, output: 'wood', amount: 1, cycle: 12 },
    resource: { terrain: forest, radius: 3, ideal: 16, label: 'forest' },
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
    production: { inputs: {}, output: 'fish', amount: 1, cycle: 10 },
    resource: { terrain: water, radius: 2, ideal: 8, label: 'open water' },
  },

  // Tier 2 production
  {
    id: 'quarry',
    name: 'Quarry',
    description: 'Breaks stone from nearby rock.',
    category: 'production',
    size: [2, 2],
    color: 0x6c6f75,
    glyph: 'Q',
    cost: { coins: 150, goods: { wood: 4, planks: 4 } },
    upkeep: 8,
    tier: 2,
    production: { inputs: {}, output: 'stone', amount: 1, cycle: 18 },
    resource: { terrain: [Terrain.Rock], radius: 2, ideal: 8, label: 'rock' },
  },
  {
    id: 'wheatFarm',
    name: 'Wheat farm',
    description: 'Grows wheat on fertile soil nearby.',
    category: 'production',
    size: [2, 2],
    color: 0xa08a3a,
    glyph: 'Wf',
    cost: { coins: 120, goods: { wood: 4, planks: 2 } },
    upkeep: 5,
    tier: 2,
    production: { inputs: {}, output: 'wheat', amount: 1, cycle: 15 },
    resource: { terrain: [Terrain.Fertile], radius: 2, ideal: 10, label: 'fertile soil' },
  },
  {
    id: 'mill',
    name: 'Mill',
    description: 'Grinds wheat into flour.',
    category: 'production',
    size: [2, 2],
    color: 0xc8b58a,
    glyph: 'Mi',
    cost: { coins: 180, goods: { planks: 6, stone: 2 } },
    upkeep: 8,
    tier: 2,
    production: { inputs: { wheat: 1 }, output: 'flour', amount: 1, cycle: 15 },
  },
  {
    id: 'bakery',
    name: 'Bakery',
    description: 'Bakes flour into bread.',
    category: 'production',
    size: [2, 2],
    color: 0xb06a3a,
    glyph: 'Bk',
    cost: { coins: 200, goods: { planks: 6, stone: 3 } },
    upkeep: 10,
    tier: 2,
    production: { inputs: { flour: 1 }, output: 'bread', amount: 1, cycle: 15 },
  },
  {
    id: 'whaler',
    name: 'Whaler',
    description: 'Hunts whales in deep water for blubber. Needs lots of open sea.',
    category: 'production',
    size: [2, 2],
    color: 0x2f5468,
    glyph: 'Wh',
    cost: { coins: 220, goods: { wood: 4, planks: 6 } },
    upkeep: 10,
    tier: 2,
    production: { inputs: {}, output: 'blubber', amount: 1, cycle: 20 },
    resource: { terrain: water, radius: 3, ideal: 18, label: 'open sea' },
  },
  {
    id: 'rendery',
    name: 'Rendery',
    description: 'Boils blubber down into lamp oil. Your people need it, and so will your lights.',
    category: 'production',
    size: [2, 2],
    color: 0x9a6a2a,
    glyph: 'Re',
    cost: { coins: 240, goods: { planks: 6, stone: 4 } },
    upkeep: 10,
    tier: 2,
    production: { inputs: { blubber: 1 }, output: 'lampOil', amount: 1, cycle: 20 },
  },

  // Tier 3 production
  {
    id: 'apiary',
    name: 'Apiary',
    description: 'Bees in the meadows make wax. Needs open grass nearby.',
    category: 'production',
    size: [2, 2],
    color: 0xc8a83a,
    glyph: 'Ap',
    cost: { coins: 250, goods: { planks: 6, stone: 2 } },
    upkeep: 12,
    tier: 3,
    production: { inputs: {}, output: 'wax', amount: 1, cycle: 20 },
    resource: { terrain: [Terrain.Grass], radius: 2, ideal: 10, label: 'meadow' },
  },
  {
    id: 'chandlery',
    name: 'Chandlery',
    description: 'Dips wax into candles.',
    category: 'production',
    size: [2, 2],
    color: 0xd8c8a0,
    glyph: 'Ch',
    cost: { coins: 320, goods: { planks: 8, stone: 6 } },
    upkeep: 14,
    tier: 3,
    production: { inputs: { wax: 1 }, output: 'candles', amount: 1, cycle: 20 },
  },
  {
    id: 'reedCutter',
    name: 'Reed cutter',
    description: 'Cuts reeds in the marsh.',
    category: 'production',
    size: [2, 2],
    color: 0x5a7a4a,
    glyph: 'Rc',
    cost: { coins: 200, goods: { planks: 6 } },
    upkeep: 10,
    tier: 3,
    production: { inputs: {}, output: 'reeds', amount: 1, cycle: 15 },
    resource: { terrain: [Terrain.Marsh], radius: 2, ideal: 6, label: 'marsh' },
  },
  {
    id: 'paperMill',
    name: 'Paper mill',
    description: 'Presses reeds into paper.',
    category: 'production',
    size: [2, 2],
    color: 0xbcb5a0,
    glyph: 'Pm',
    cost: { coins: 320, goods: { planks: 8, stone: 6 } },
    upkeep: 14,
    tier: 3,
    production: { inputs: { reeds: 1 }, output: 'paper', amount: 1, cycle: 20 },
  },
  {
    id: 'inkBoat',
    name: 'Ink boat',
    description: 'Catches squid for their ink. Must be built by open water.',
    category: 'production',
    size: [2, 2],
    color: 0x3a3f6a,
    glyph: 'Ib',
    cost: { coins: 260, goods: { planks: 8 } },
    upkeep: 12,
    tier: 3,
    production: { inputs: {}, output: 'ink', amount: 1, cycle: 20 },
    resource: { terrain: water, radius: 2, ideal: 8, label: 'open water' },
  },
  {
    id: 'bookbinder',
    name: 'Bookbinder',
    description: 'Binds paper and ink into books.',
    category: 'production',
    size: [2, 2],
    color: 0x7a3a3a,
    glyph: 'Bb',
    cost: { coins: 400, goods: { planks: 8, stone: 8 } },
    upkeep: 16,
    tier: 3,
    production: { inputs: { paper: 1, ink: 1 }, output: 'books', amount: 1, cycle: 25 },
  },
];

const full: BuildingDef[] = defs.map((d) => ({ ...d, playerBuildable: d.playerBuildable ?? true, tier: d.tier ?? 1 }));

export const BUILDINGS = Object.fromEntries(full.map((d) => [d.id, d])) as Record<BuildingId, BuildingDef>;
export const BUILDING_LIST: readonly BuildingDef[] = full;
