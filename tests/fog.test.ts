import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { canPlace, lPath, placeBuilding } from '../src/sim/build';
import { isBuildingLit, isLit, lightRadius, refreshLight } from '../src/sim/fog';
import { dreadRate } from '../src/sim/population';
import { addBuilding, createGame, type Building, type GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { testState } from './helpers';

function place(s: GameState, type: BuildingId, x: number, y: number): Building {
  const r = placeBuilding(s, type, x, y);
  if (!r.ok) throw new Error(`${type} at ${x},${y}: ${r.reason}`);
  return r.building;
}

/** A dark 40x40 world with the Last Lantern at (5, 5) and a road east along row 4, out into the dark. */
function darkWorld(): GameState {
  const s = testState(undefined, 40, { dark: true });
  addBuilding(s, 'lantern', 5, 5);
  for (const [x, y] of lPath(2, 4, 24, 4)) addBuilding(s, 'road', x, y);
  refreshLight(s);
  Object.assign(s.goods, { wood: 50, planks: 50, fish: 50 });
  return s;
}

describe('light and fog', () => {
  it('lights a circle around the Last Lantern and leaves the rest dark', () => {
    const s = darkWorld();
    expect(isLit(s, 5, 5)).toBe(true);
    expect(isLit(s, 5 + 7, 5)).toBe(true);
    expect(isLit(s, 5 + 10, 5)).toBe(false);
    expect(isLit(s, 30, 30)).toBe(false);
  });

  it('marks what it has seen as explored, a little beyond the light', () => {
    const s = darkWorld();
    const W = s.map.width;
    expect(s.explored[5 * W + 14]).toBe(1);
    expect(s.explored[30 * W + 30]).toBe(0);
  });

  it('only lets you build where it is lit', () => {
    const s = darkWorld();
    expect(canPlace(s, 'house', 7, 6).ok).toBe(true);
    const far = canPlace(s, 'house', 20, 20);
    expect(far.ok).toBe(false);
    expect(!far.ok && far.reason).toMatch(/dark/i);
  });

  it('a fuelled brazier blooms, burns wood, and pushes the fog back', () => {
    const s = darkWorld();
    const brazier = place(s, 'brazier', 12, 5);
    expect(isLit(s, 17, 5)).toBe(false);
    const wood = s.goods.wood;
    advance(s, 10);
    expect(brazier.intensity).toBe(1);
    expect(isLit(s, 16, 5)).toBe(true);
    expect(s.goods.wood).toBeLessThan(wood);
    expect(s.goods.wood).toBeCloseTo(wood - (BUILDINGS.brazier.light!.burn * 10) / 60, 1);
  });

  it('when fuel runs out the light fades and the fog creeps back, but explored stays explored', () => {
    const s = darkWorld();
    const brazier = place(s, 'brazier', 12, 5);
    advance(s, 10);
    const mill = place(s, 'sawmill', 15, 5); // only lit by the brazier
    s.goods.wood = 0;
    advance(s, 1);
    expect(brazier.status).toBe('noFuel');
    expect(isLit(s, 16, 5)).toBe(true); // fading, not gone yet
    advance(s, BALANCE.lightFadeTime + 1);
    expect(brazier.intensity).toBe(0);
    expect(isLit(s, 16, 5)).toBe(false);
    expect(s.explored[5 * s.map.width + 16]).toBe(1);
    expect(isBuildingLit(s, mill)).toBe(false);
    expect(mill.status).toBe('dark');
  });

  it('unconnected lights get no fuel', () => {
    const s = darkWorld();
    const b = place(s, 'brazier', 8, 9);
    advance(s, 5);
    expect(b.status).toBe('unconnected');
    expect(b.intensity).toBe(0);
  });
});

describe('the Tolling', () => {
  it('cycles calm → warning → surge → calm', () => {
    const s = createGame('bell');
    expect(s.tolling.phase).toBe('calm');
    advance(s, BALANCE.firstTolling + 1);
    expect(s.tolling.phase).toBe('warning');
    advance(s, BALANCE.tollingWarning);
    expect(s.tolling.phase).toBe('surge');
    expect(s.tolling.count).toBe(1);
    advance(s, BALANCE.tollingSurge);
    expect(s.tolling.phase).toBe('calm');
    expect(s.tolling.timer).toBeCloseTo(BALANCE.tollingCalm - 1, 0);
  });

  it('shrinks lights during a surge unless they burn double fuel', () => {
    const s = darkWorld();
    const brazier = place(s, 'brazier', 12, 5);
    const lantern = s.buildings.find((b) => b.type === 'lantern')!;
    advance(s, 5);
    const full = lightRadius(s, brazier);
    s.tolling = { phase: 'surge', timer: 60, strength: 0, count: 1 };
    advance(s, BALANCE.surgeRamp + 1);
    expect(lightRadius(s, brazier)).toBeCloseTo(full * (1 - BALANCE.surgeShrink));
    expect(lightRadius(s, lantern)).toBeCloseTo(BUILDINGS.lantern.light!.radius * (1 - BALANCE.surgeShrink));

    s.doubleFuel = true;
    const wood = s.goods.wood;
    advance(s, 6);
    expect(lightRadius(s, brazier)).toBeCloseTo(full);
    expect(wood - s.goods.wood).toBeCloseTo((BUILDINGS.brazier.light!.burn * 2 * 6) / 60, 1);
    // The Last Lantern has no fuel to burn, so it always shrinks.
    expect(lightRadius(s, lantern)).toBeLessThan(BUILDINGS.lantern.light!.radius);
  });
});

describe('dread', () => {
  it('rises in the dark and when needs go unmet, falls when content and near a shrine', () => {
    const s = darkWorld();
    s.unlockedTier = 1;
    const lit = place(s, 'house', 7, 5);
    // A house out in the dark: built while a brazier stood there.
    const unlit = addBuilding(s, 'house', 30, 30);
    advance(s, 1);
    expect(dreadRate(s, unlit)).toBeGreaterThan(0);
    expect(dreadRate(s, lit)).toBeLessThan(0);
    const calm = dreadRate(s, lit);
    place(s, 'shrine', 9, 5);
    advance(s, 0.2);
    expect(dreadRate(s, lit)).toBeLessThan(calm);
  });

  it('at 100 the residents walk into the fog and the house stands empty', () => {
    const s = darkWorld();
    const h = place(s, 'house', 7, 5);
    h.residents = 6;
    h.dread = 99.9;
    h.supply = { fish: 0, wood: 0 };
    s.goods.fish = 0;
    advance(s, 1);
    expect(h.residents).toBe(0);
    expect(s.lost).toBe(6);
    expect(h.status).toBe('abandoned');
    expect(h.dread).toBeLessThan(100);

    // Nobody moves in while the door stands open.
    s.goods.fish = 50;
    advance(s, BALANCE.abandonTime - 5);
    expect(h.residents).toBe(0);
    advance(s, 30);
    expect(h.residents).toBeGreaterThan(0);
  });

  it('dark houses pay no tax and do not grow', () => {
    const s = darkWorld();
    const h = addBuilding(s, 'house', 16, 5); // beside the road, outside the light
    advance(s, 30);
    expect(h.status).toBe('dark');
    expect(h.residents).toBe(0);
  });
});
