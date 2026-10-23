import { GOOD_IDS, type GoodId } from '../src/data/goods';
import { Terrain } from '../src/sim/map';
import { addBuilding, type GameState } from '../src/sim/state';

/**
 * A small hand-made world for tests: all grass, with a warehouse at (2, 2).
 * The whole map counts as lit unless `opts.dark` is set; the Tolling never comes.
 * `rows` can paint terrain: '~' water, 'T' forest, '^' rock, '%' marsh, '.' grass.
 */
export function testState(rows?: string[], size = 20, opts: { dark?: boolean } = {}): GameState {
  const height = rows?.length ?? size;
  const width = rows?.[0].length ?? size;
  const terrain: Terrain[] = new Array(width * height).fill(Terrain.Grass);
  const kinds: Record<string, Terrain> = {
    '~': Terrain.Water,
    T: Terrain.Forest,
    '^': Terrain.Rock,
    '%': Terrain.Marsh,
    '.': Terrain.Grass,
    c: Terrain.Coast,
  };
  rows?.forEach((row, y) => [...row].forEach((ch, x) => (terrain[y * width + x] = kinds[ch] ?? Terrain.Grass)));

  const state: GameState = {
    version: 1,
    seed: 'test',
    time: 0,
    map: { width, height, terrain, rev: 0 },
    buildings: [],
    nextId: 1,
    coins: 10_000,
    goods: Object.fromEntries(GOOD_IDS.map((g) => [g, 0])) as Record<GoodId, number>,
    unlockedTier: 1,
    explored: new Array(width * height).fill(0),
    tolling: { phase: 'calm', timer: 1e9, strength: 0, count: 0 },
    doubleFuel: false,
    lost: 0,
    rev: 0,
    alwaysLit: !opts.dark,
  };
  state.goods.wood = 50;
  state.goods.planks = 50;
  addBuilding(state, 'warehouse', 2, 2);
  return state;
}
