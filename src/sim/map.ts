import { fbm, hashString, Rng } from './rng';

/** Terrain types. Stored as small ints so the map stays compact and JSON-friendly. */
export const Terrain = {
  Water: 0,
  Coast: 1,
  Grass: 2,
  Fertile: 3,
  Forest: 4,
  Marsh: 5,
  Rock: 6,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_NAMES: Record<Terrain, string> = {
  0: 'Water',
  1: 'Coast',
  2: 'Grass',
  3: 'Fertile soil',
  4: 'Forest',
  5: 'Marsh',
  6: 'Rock',
};

export interface GameMap {
  width: number;
  height: number;
  /** Row-major terrain, index = y * width + x. */
  terrain: Terrain[];
  /** Bumped whenever terrain changes so the renderer knows to redraw. */
  rev: number;
}

export const DEFAULT_MAP_SIZE = 96;

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function terrainAt(map: GameMap, x: number, y: number): Terrain {
  return inBounds(map, x, y) ? map.terrain[y * map.width + x] : Terrain.Water;
}

export function setTerrain(map: GameMap, x: number, y: number, t: Terrain): void {
  map.terrain[y * map.width + x] = t;
  map.rev++;
}

export function isLand(t: Terrain): boolean {
  return t !== Terrain.Water;
}

/** Generate an island from a seed. Same seed, same island. */
export function generateMap(seed: string, width = DEFAULT_MAP_SIZE, height = DEFAULT_MAP_SIZE): GameMap {
  const s = hashString(seed);
  const terrain: Terrain[] = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = ((x + 0.5) / width) * 2 - 1;
      const ny = ((y + 0.5) / height) * 2 - 1;
      // Distance from centre, squashed a little by noise so the outline isn't a circle.
      const d = Math.sqrt(nx * nx + ny * ny);
      const elevation = fbm(x / 20, y / 20, s, 5) + 0.62 - Math.pow(d, 2) * 1.15;
      const moisture = fbm(x / 14, y / 14, (s + 0x9e37) >>> 0, 4);
      const fertility = fbm(x / 10, y / 10, (s + 0x51ed) >>> 0, 3);
      const rockiness = fbm(x / 12, y / 12, (s + 0x2c1b) >>> 0, 3);

      let t: Terrain;
      if (elevation < 0.5) t = Terrain.Water;
      else if (rockiness > 0.68 && elevation > 0.66) t = Terrain.Rock;
      else if (moisture > 0.62 && elevation < 0.64) t = Terrain.Marsh;
      else if (moisture > 0.52) t = Terrain.Forest;
      else if (fertility > 0.58) t = Terrain.Fertile;
      else t = Terrain.Grass;
      terrain[y * width + x] = t;
    }
  }

  // Land next to water becomes coast (rock cliffs stay rock).
  const isWater = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height || terrain[y * width + x] === Terrain.Water;
  const coast: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain[y * width + x];
      if (t === Terrain.Water || t === Terrain.Rock) continue;
      if (isWater(x - 1, y) || isWater(x + 1, y) || isWater(x, y - 1) || isWater(x, y + 1)) {
        coast.push(y * width + x);
      }
    }
  }
  for (const i of coast) terrain[i] = Terrain.Coast;

  return { width, height, terrain, rev: 0 };
}

/** Terrain a normal building can stand on. Forest gets cleared when built over. */
export function isBuildableTerrain(t: Terrain): boolean {
  return t === Terrain.Grass || t === Terrain.Fertile || t === Terrain.Forest || t === Terrain.Coast;
}

/** Count tiles of the given kinds within `radius` (Chebyshev) of a rectangle, excluding the rectangle. */
export function countAround(
  map: GameMap,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  kinds: readonly Terrain[],
  skip?: (x: number, y: number) => boolean,
): number {
  let n = 0;
  for (let ty = y - radius; ty < y + h + radius; ty++) {
    for (let tx = x - radius; tx < x + w + radius; tx++) {
      if (tx >= x && tx < x + w && ty >= y && ty < y + h) continue;
      if (!inBounds(map, tx, ty)) continue;
      if (!kinds.includes(terrainAt(map, tx, ty))) continue;
      if (skip?.(tx, ty)) continue;
      n++;
    }
  }
  return n;
}

/**
 * Pick where the colony starts: a spot with room to build, forest close by,
 * and the sea within reach, as near the island's centre as possible.
 * Returns the top-left of a 2x2 warehouse footprint.
 */
export function findStartSite(map: GameMap): { x: number; y: number } {
  const cx = map.width / 2;
  const cy = map.height / 2;
  let best = { x: Math.floor(cx), y: Math.floor(cy) };
  let bestScore = -Infinity;
  const buildable: Terrain[] = [Terrain.Grass, Terrain.Fertile, Terrain.Coast];

  for (let y = 4; y < map.height - 5; y++) {
    for (let x = 4; x < map.width - 5; x++) {
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++) {
        for (let dx = 0; dx < 2 && ok; dx++) {
          if (!buildable.includes(terrainAt(map, x + dx, y + dy))) ok = false;
        }
      }
      if (!ok) continue;
      const room = countAround(map, x, y, 2, 2, 5, buildable);
      const forest = Math.min(countAround(map, x, y, 2, 2, 9, [Terrain.Forest]), 25);
      const water = countAround(map, x, y, 2, 2, 10, [Terrain.Water]);
      const dist = Math.hypot(x + 1 - cx, y + 1 - cy);
      const score = room + forest * 1.5 + (water > 6 ? 20 : -60) - dist * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * Every tier needs some ground of its own: fertile soil for bread, rock for stone, marsh for books.
 * If an island has none of one within reach of the landing, paint a small patch at a fair distance,
 * so no island makes a tier impossible. Same seed, same patches.
 */
export const RESOURCE_REACH: { kind: Terrain; within: number; at: number }[] = [
  { kind: Terrain.Fertile, within: 12, at: 9 },
  { kind: Terrain.Rock, within: 16, at: 12 },
  { kind: Terrain.Marsh, within: 20, at: 15 },
];

/** Distance from (cx, cy) to the nearest patch of `kind` (a tile with at least 6 of it in the 5x5 around). */
export function patchDistance(map: GameMap, cx: number, cy: number, kind: Terrain): number {
  let best = Infinity;
  for (let y = 2; y < map.height - 2; y++) {
    for (let x = 2; x < map.width - 2; x++) {
      if (map.terrain[y * map.width + x] !== kind) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= best) continue;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (map.terrain[(y + dy) * map.width + x + dx] === kind) n++;
      if (n >= 6) best = d;
    }
  }
  return best;
}

export function ensureResources(map: GameMap, seed: string, site: { x: number; y: number }): void {
  const rng = new Rng(hashString(seed + ':patches'));
  const cx = site.x + 1;
  const cy = site.y + 1;
  const W = map.width;
  const inland = (x: number, y: number) => {
    const t = terrainAt(map, x, y);
    return t !== Terrain.Water && t !== Terrain.Coast;
  };
  // A new patch never paints over another resource, so it can't take away a patch already in reach.
  const otherResource = (x: number, y: number, kind: Terrain) => {
    const t = terrainAt(map, x, y);
    return t !== kind && RESOURCE_REACH.some((r) => r.kind === t);
  };
  for (const { kind, within, at } of RESOURCE_REACH) {
    if (patchDistance(map, cx, cy, kind) <= within) continue;
    // Candidate centres: inland tiles about `at` away, with inland ground all around.
    // Spots clear of other resources come first, so the patch is painted whole.
    const clear: { x: number; y: number }[] = [];
    const spots: { x: number; y: number }[] = [];
    for (let y = 3; y < map.height - 3; y++) {
      for (let x = 3; x < W - 3; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (Math.abs(d - at) > 2) continue;
        let ok = true;
        let free = true;
        for (let dy = -2; dy <= 2 && ok; dy++) {
          for (let dx = -2; dx <= 2 && ok; dx++) {
            ok = inland(x + dx, y + dy);
            if (otherResource(x + dx, y + dy, kind)) free = false;
          }
        }
        if (ok) (free ? clear : spots).push({ x, y });
      }
    }
    const pool = clear.length ? clear : spots;
    if (!pool.length) continue;
    const c = rng.pick(pool);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        // A ragged blob rather than a square.
        if (dx * dx + dy * dy > 4.5 + rng.next() * 2) continue;
        if (!inland(x, y) || otherResource(x, y, kind) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 6) continue;
        map.terrain[y * W + x] = kind;
      }
    }
  }
}
