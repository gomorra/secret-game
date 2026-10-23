import { BALANCE } from '../data/balance';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { GOOD_IDS, type GoodId } from '../data/goods';
import type { RelicId } from '../data/relics';
import { refreshLight } from './fog';
import { FIRST_LEGACY, placeSites, type GameEvent, type Legacy, type Site } from './lore';
import { countAround, findStartSite, generateMap, inBounds, isLand, terrainAt, type GameMap } from './map';

export type BuildingStatus =
  | 'ok'
  | 'working'
  | 'unconnected'
  | 'noInput'
  | 'storageFull'
  | 'noResource'
  | 'needsUnmet'
  | 'dark'
  | 'noFuel'
  | 'abandoned';

export type TollingPhase = 'calm' | 'warning' | 'surge';

export interface Tolling {
  phase: TollingPhase;
  /** Seconds left in the current phase. */
  timer: number;
  /** How far the current surge has rolled in, 0..1. */
  strength: number;
  /** Surges so far. */
  count: number;
}

export interface Building {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
  status: BuildingStatus;
  /** Production: true while a cycle is running (inputs already taken). */
  active?: boolean;
  /** Production: 0..1 progress through the current cycle. */
  progress?: number;
  /** Housing. */
  tier?: number;
  residents?: number;
  growth?: number;
  /** Housing: seconds the house has been ready to upgrade. */
  content?: number;
  /** Housing: smoothed satisfaction per need, 0..1. */
  supply?: Partial<Record<GoodId, number>>;
  /** Housing: fear, 0..100. At 100 the residents walk into the fog. */
  dread?: number;
  /** Housing: seconds the house stays empty after its residents were lost. */
  emptyFor?: number;
  /** Lights: current strength 0..1. Rises when fuelled, fades when not. */
  intensity?: number;
  /** Lights: had fuel on the last step. */
  fueled?: boolean;
}

export interface GameState {
  version: 1;
  seed: string;
  /** Simulated seconds since the colony landed. */
  time: number;
  map: GameMap;
  buildings: Building[];
  nextId: number;
  coins: number;
  goods: Record<GoodId, number>;
  /** Highest population tier unlocked so far. Never goes back down. */
  unlockedTier: number;
  /** 1 for tiles that have been seen at least once. */
  explored: number[];
  tolling: Tolling;
  /** Player choice: burn double fuel during a surge to keep lights at full size. */
  doubleFuel: boolean;
  /** Residents who have walked into the fog. */
  lost: number;
  /** Sandbox/testing: treat the whole map as lit. */
  alwaysLit?: boolean;

  /** Which cycle of the loop this is, from 1. */
  cycle: number;
  /** Secrets hidden in the fog. */
  sites: Site[];
  /** Lore pages: found (still in cipher) or read. */
  codex: Record<string, 'found' | 'read'>;
  relics: RelicId[];
  /** Whispering stones whose deal you accepted. */
  pacts: number;
  /** Names of residents lost this cycle, and in earlier ones. */
  lostNames: string[];
  echoes: string[];
  /** Archive progress on the current cipher page, 0..1. */
  decipher: number;
  whisperTimer: number;
  /** Compass direction of the Drowned Bell from the landing, for the journals. */
  bellDir: string;
  bellRung: boolean;
  /** Messages for the HUD. Transient: not worth saving. */
  events: GameEvent[];
  /** Bumped on every structural change (placing, demolishing). */
  rev: number;
}

/** Caches derived from the state. Never saved; rebuilt whenever `rev` changes. */
export interface Derived {
  rev: number;
  mapRev: number;
  /** Building id per tile, 0 = empty. */
  occ: Int32Array;
  byId: Map<number, Building>;
  /** 1 for road tiles that link back to a warehouse. */
  roadNet: Uint8Array;
  /** Ids of buildings connected to a warehouse. */
  connected: Set<number>;
  /** Resource efficiency (0..1) for harvesting buildings. */
  efficiency: Map<number, number>;
  /** Storage cap per good. */
  storageCap: number;
  /** Tiles held by a site in the fog (index → site). */
  siteTiles: Map<number, Site>;
  /** For each house: ids of connected service buildings in range of it. */
  services: Map<number, number[]>;
}

const derivedCache = new WeakMap<GameState, Derived>();

export function createGame(seed: string, legacy: Legacy = FIRST_LEGACY): GameState {
  const map = generateMap(seed);
  const state: GameState = {
    version: 1,
    seed,
    time: 0,
    map,
    buildings: [],
    nextId: 1,
    coins: BALANCE.startCoins,
    goods: Object.fromEntries(GOOD_IDS.map((g) => [g, 0])) as Record<GoodId, number>,
    unlockedTier: 1,
    explored: new Array(map.width * map.height).fill(0),
    tolling: { phase: 'calm', timer: BALANCE.firstTolling, strength: 0, count: 0 },
    doubleFuel: false,
    lost: 0,
    cycle: legacy.cycle,
    sites: [],
    codex: { ...legacy.codex },
    relics: [...legacy.relics],
    pacts: 0,
    lostNames: [],
    echoes: [...legacy.echoes],
    decipher: 0,
    whisperTimer: 0,
    bellDir: 'north',
    bellRung: false,
    events: [],
    rev: 0,
  };
  for (const [g, n] of Object.entries(BALANCE.startGoods)) state.goods[g as GoodId] = n;

  const site = findStartSite(map);
  addBuilding(state, 'warehouse', site.x, site.y);
  // The Last Lantern stands just beside the warehouse, on the first free land tile found.
  const spots = [
    [site.x + 2, site.y],
    [site.x - 1, site.y + 1],
    [site.x, site.y + 2],
    [site.x + 1, site.y - 1],
    [site.x + 2, site.y + 1],
    [site.x - 1, site.y],
  ];
  for (const [x, y] of spots) {
    if (inBounds(map, x, y) && isLand(terrainAt(map, x, y))) {
      addBuilding(state, 'lantern', x, y);
      break;
    }
  }
  const lantern = state.buildings.find((b) => b.type === 'lantern') ?? state.buildings[0];
  placeSites(state, { x: lantern.x, y: lantern.y });
  refreshLight(state);
  return state;
}

/** Add a building without any cost or rule checks. Used for setup and by `placeBuilding`. */
export function addBuilding(state: GameState, type: BuildingId, x: number, y: number): Building {
  const b: Building = { id: state.nextId++, type, x, y, status: 'ok' };
  const def = BUILDINGS[type];
  if (def.production) {
    b.active = false;
    b.progress = 0;
  }
  if (type === 'house') {
    b.tier = 1;
    b.residents = 0;
    b.growth = 0;
    b.content = 0;
    b.supply = {};
    b.dread = 0;
    b.emptyFor = 0;
  }
  if (def.light) {
    // Fuelled lights start dark and bloom once they get fuel.
    b.intensity = def.light.fuel ? 0 : 1;
    b.fueled = !def.light.fuel;
  }
  state.buildings.push(b);
  state.rev++;
  return b;
}

export function footprint(b: { type: BuildingId; x: number; y: number }): { x: number; y: number; w: number; h: number } {
  const [w, h] = BUILDINGS[b.type].size;
  return { x: b.x, y: b.y, w, h };
}

export function derived(state: GameState): Derived {
  const cached = derivedCache.get(state);
  if (cached && cached.rev === state.rev && cached.mapRev === state.map.rev) return cached;
  const d = computeDerived(state);
  derivedCache.set(state, d);
  return d;
}

function computeDerived(state: GameState): Derived {
  const { map } = state;
  const W = map.width;
  const occ = new Int32Array(W * map.height);
  const byId = new Map<number, Building>();
  let warehouses = 0;

  for (const b of state.buildings) {
    byId.set(b.id, b);
    const f = footprint(b);
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) occ[y * W + x] = b.id;
    }
    if (b.type === 'warehouse') warehouses++;
  }

  const isRoad = (x: number, y: number) => {
    if (!inBounds(map, x, y)) return false;
    const id = occ[y * W + x];
    return id !== 0 && byId.get(id)!.type === 'road';
  };

  // Flood-fill the road network outward from every warehouse.
  const roadNet = new Uint8Array(W * map.height);
  const queue: number[] = [];
  for (const b of state.buildings) {
    if (b.type !== 'warehouse') continue;
    for (const [x, y] of perimeter(footprint(b))) {
      if (isRoad(x, y) && !roadNet[y * W + x]) {
        roadNet[y * W + x] = 1;
        queue.push(y * W + x);
      }
    }
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (isRoad(nx, ny) && !roadNet[ny * W + nx]) {
        roadNet[ny * W + nx] = 1;
        queue.push(ny * W + nx);
      }
    }
  }

  const connected = new Set<number>();
  const efficiency = new Map<number, number>();
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (b.type === 'warehouse' || b.type === 'lantern') connected.add(b.id);
    else if (b.type === 'road') {
      if (roadNet[b.y * W + b.x]) connected.add(b.id);
    } else if (perimeter(footprint(b)).some(([x, y]) => inBounds(map, x, y) && roadNet[y * W + x])) {
      connected.add(b.id);
    }
    if (def.resource) {
      const f = footprint(b);
      efficiency.set(b.id, resourceEfficiency(state, occ, b.type, f.x, f.y));
    }
  }

  // Which service buildings reach which houses (centre to centre, Chebyshev distance).
  const services = new Map<number, number[]>();
  const providers = state.buildings.filter((b) => BUILDINGS[b.type].serviceRadius && connected.has(b.id));
  for (const h of state.buildings) {
    if (h.type !== 'house') continue;
    const ids: number[] = [];
    const hc = centre(h);
    for (const p of providers) {
      const pc = centre(p);
      if (Math.max(Math.abs(pc.x - hc.x), Math.abs(pc.y - hc.y)) <= BUILDINGS[p.type].serviceRadius!) ids.push(p.id);
    }
    services.set(h.id, ids);
  }

  return {
    rev: state.rev,
    mapRev: map.rev,
    occ,
    byId,
    roadNet,
    connected,
    efficiency,
    storageCap: warehouses * BALANCE.warehouseStorage,
    services,
    siteTiles: new Map(state.sites.map((s) => [s.y * W + s.x, s])),
  };
}

/** Centre of a building's footprint, in tiles. */
export function centre(b: { type: BuildingId; x: number; y: number }): { x: number; y: number } {
  const [w, h] = BUILDINGS[b.type].size;
  return { x: b.x + w / 2, y: b.y + h / 2 };
}

/** Tiles orthogonally touching a rectangle's outside edge. */
export function perimeter(f: { x: number; y: number; w: number; h: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let x = f.x; x < f.x + f.w; x++) out.push([x, f.y - 1], [x, f.y + f.h]);
  for (let y = f.y; y < f.y + f.h; y++) out.push([f.x - 1, y], [f.x + f.w, y]);
  return out;
}

/** Efficiency (0..1) a harvesting building would have at this spot. */
export function resourceEfficiency(
  state: GameState,
  occ: Int32Array,
  type: BuildingId,
  x: number,
  y: number,
  ignoreId = 0,
): number {
  const def = BUILDINGS[type];
  if (!def.resource) return 1;
  const [w, h] = def.size;
  const W = state.map.width;
  const r = def.resource;
  const n = countAround(state.map, x, y, w, h, r.radius, r.terrain, (tx, ty) => {
    const id = occ[ty * W + tx];
    return id !== 0 && id !== ignoreId;
  });
  return Math.min(1, n / r.ideal);
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const d = derived(state);
  const id = d.occ[y * state.map.width + x];
  return id ? d.byId.get(id) : undefined;
}

export function population(state: GameState): number {
  let n = 0;
  for (const b of state.buildings) n += b.residents ?? 0;
  return n;
}

/** Residents living in houses of exactly this tier. */
export function populationOfTier(state: GameState, tier: number): number {
  let n = 0;
  for (const b of state.buildings) if (b.type === 'house' && b.tier === tier) n += b.residents ?? 0;
  return n;
}
