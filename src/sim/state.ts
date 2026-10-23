import { BALANCE } from '../data/balance';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { GOOD_IDS, type GoodId } from '../data/goods';
import { countAround, findStartSite, generateMap, inBounds, isLand, terrainAt, type GameMap } from './map';

export type BuildingStatus =
  | 'ok'
  | 'working'
  | 'unconnected'
  | 'noInput'
  | 'storageFull'
  | 'noResource'
  | 'needsUnmet';

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
  /** Housing: smoothed satisfaction per need, 0..1. */
  supply?: Partial<Record<GoodId, number>>;
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
}

const derivedCache = new WeakMap<GameState, Derived>();

export function createGame(seed: string): GameState {
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
    b.supply = {};
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

  return {
    rev: state.rev,
    mapRev: map.rev,
    occ,
    byId,
    roadNet,
    connected,
    efficiency,
    storageCap: warehouses * BALANCE.warehouseStorage,
  };
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
