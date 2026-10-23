import { describe, expect, it } from 'vitest';
import { countAround, findStartSite, generateMap, patchDistance, RESOURCE_REACH, Terrain, terrainAt } from '../src/sim/map';
import { canPlace } from '../src/sim/build';
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

  it.each(SEEDS)('lights enough of the start for a working woodcutter (seed %s)', (seed) => {
    const s = createGame(seed);
    let best = 0;
    for (let y = 0; y < s.map.height; y++) {
      for (let x = 0; x < s.map.width; x++) {
        const c = canPlace(s, 'woodcutter', x, y);
        if (c.ok) best = Math.max(best, c.efficiency ?? 0);
      }
    }
    expect(best).toBeGreaterThan(0.5);
  });

  it.each(SEEDS)('puts fertile soil, rock and marsh within reach of the landing (seed %s)', (seed) => {
    const s = createGame(seed);
    const w = s.buildings.find((b) => b.type === 'warehouse')!;
    for (const { kind, within } of RESOURCE_REACH) {
      expect(patchDistance(s.map, w.x + 1, w.y + 1, kind)).toBeLessThanOrEqual(within + 3);
    }
  });

  it('starts a game with a warehouse and the Last Lantern', () => {
    const state = createGame('fog');
    expect(state.buildings.map((b) => b.type).sort()).toEqual(['lantern', 'warehouse']);
    const d = derived(state);
    expect(d.storageCap).toBeGreaterThan(0);
  });
});
