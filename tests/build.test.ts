import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { canPlace, demolishAt, lPath, placeBuilding } from '../src/sim/build';
import { Terrain, terrainAt } from '../src/sim/map';
import { buildingAt, derived } from '../src/sim/state';
import { testState } from './helpers';

describe('placing buildings', () => {
  it('charges the cost', () => {
    const s = testState();
    const coins = s.coins;
    const res = placeBuilding(s, 'house', 8, 8);
    expect(res.ok).toBe(true);
    expect(s.goods.wood).toBe(50 - (BUILDINGS.house.cost.goods.wood ?? 0));
    expect(s.coins).toBe(coins - BUILDINGS.house.cost.coins);
  });

  it('rejects overlaps, water, rock and out of bounds', () => {
    const s = testState(['~~~~~~~~~~', '..........', '..........', '..........', '..........', '....^^....', '..........', '..........']);
    expect(canPlace(s, 'house', 2, 2).ok).toBe(false); // warehouse is here
    expect(canPlace(s, 'house', 0, 0).ok).toBe(false); // water
    expect(canPlace(s, 'house', 4, 4).ok).toBe(false); // rock below
    expect(canPlace(s, 'house', 9, 6).ok).toBe(false); // half off the map
    expect(canPlace(s, 'house', 6, 6).ok).toBe(true);
  });

  it('refuses when you cannot pay', () => {
    const s = testState();
    s.goods.wood = 0;
    const check = canPlace(s, 'house', 8, 8);
    expect(check.ok).toBe(false);
    expect(placeBuilding(s, 'house', 8, 8).ok).toBe(false);
    expect(s.buildings.length).toBe(1);
  });

  it('clears forest it is built on', () => {
    const s = testState(['..........', '..........', '..........', '..........', '..........', '.....TT...', '.....TT...', '..........']);
    expect(placeBuilding(s, 'house', 5, 5).ok).toBe(true);
    expect(terrainAt(s.map, 5, 5)).toBe(Terrain.Grass);
    expect(terrainAt(s.map, 6, 6)).toBe(Terrain.Grass);
  });

  it('needs resources nearby for harvesters', () => {
    const s = testState();
    const check = canPlace(s, 'woodcutter', 10, 10);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toMatch(/forest/);

    const forest = testState(['....................', '....................', '....................', '....................', '....................', '..........TTTT......', '..........TTTT......', '..........TTTT......', '..........TTTT......', '....................']);
    const ok = canPlace(forest, 'woodcutter', 8, 6);
    expect(ok.ok).toBe(true);
    expect(ok.efficiency).toBeGreaterThan(0);
    expect(ok.efficiency).toBeLessThanOrEqual(1);
  });

  it('demolishes with a partial refund but keeps the last warehouse and the lantern', () => {
    const s = testState();
    placeBuilding(s, 'house', 8, 8);
    const wood = s.goods.wood;
    expect(demolishAt(s, 9, 9).ok).toBe(true);
    expect(buildingAt(s, 8, 8)).toBeUndefined();
    expect(s.goods.wood).toBe(wood + 1); // half of 3, rounded down
    expect(demolishAt(s, 2, 2).ok).toBe(false);
    expect(demolishAt(s, 15, 15).ok).toBe(false);
  });
});

describe('road connections', () => {
  it('connects buildings to a warehouse through roads', () => {
    const s = testState();
    const house = placeBuilding(s, 'house', 10, 2);
    if (!house.ok) throw new Error(house.reason);
    expect(derived(s).connected.has(house.building.id)).toBe(false);

    // Road from the warehouse's right side (x = 4) to the house's left side (x = 9).
    for (const [x, y] of lPath(4, 2, 9, 2)) placeBuilding(s, 'road', x, y);
    expect(derived(s).connected.has(house.building.id)).toBe(true);

    // Cutting the road disconnects it again.
    demolishAt(s, 6, 2);
    expect(derived(s).connected.has(house.building.id)).toBe(false);
  });

  it('builds L-shaped paths with both ends', () => {
    expect(lPath(0, 0, 3, 1)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
    ]);
    expect(lPath(2, 2, 2, 2)).toEqual([[2, 2]]);
    expect(lPath(0, 3, 0, 0)).toHaveLength(4);
  });
});
