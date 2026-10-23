import { describe, expect, it } from 'vitest';
import { countAround, findStartSite, generateMap, Terrain, terrainAt } from '../src/sim/map';
import { createGame, derived } from '../src/sim/state';

const SEEDS = ['fog', 'lantern', 'bell', 'a', 'b', 'c', 'd', 'e', 'whisper', '12345'];

describe('map generation', () => {
  it('is reproducible from a seed', () => {
    expect(generateMap('fog').terrain).toEqual(generateMap('fog').terrain);
    expect(generateMap('fog').terrain).not.toEqual(generateMap('bell').terrain);
  });

  it.each(SEEDS)('makes a playable island (seed %s)', (seed) => {
    const map = generateMap(seed);
    const water = map.terrain.filter((t) => t === Terrain.Water).length;
    const land = 1 - water / map.terrain.length;
    expect(land).toBeGreaterThan(0.25);
    expect(land).toBeLessThan(0.65);
    // The border is sea, so the island never touches the edge.
    for (let i = 0; i < map.width; i++) {
      expect(terrainAt(map, i, 0)).toBe(Terrain.Water);
      expect(terrainAt(map, i, map.height - 1)).toBe(Terrain.Water);
    }

    const site = findStartSite(map);
    expect(countAround(map, site.x, site.y, 2, 2, 9, [Terrain.Forest])).toBeGreaterThanOrEqual(8);
    expect(countAround(map, site.x, site.y, 2, 2, 10, [Terrain.Water])).toBeGreaterThan(6);
  });

  it('starts a game with a warehouse and the Last Lantern', () => {
    const state = createGame('fog');
    expect(state.buildings.map((b) => b.type).sort()).toEqual(['lantern', 'warehouse']);
    const d = derived(state);
    expect(d.storageCap).toBeGreaterThan(0);
  });
});
