import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import type { BuildingId } from '../src/data/buildings';
import { tierDef } from '../src/data/tiers';
import { canPlace, lPath, placeBuilding } from '../src/sim/build';
import { taxPerMinute } from '../src/sim/economy';
import { hasLuxury, houseTax, upgradeBlocker } from '../src/sim/population';
import { populationOfTier, type Building, type GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { testState } from './helpers';

function place(s: GameState, type: BuildingId, x: number, y: number): Building {
  const r = placeBuilding(s, type, x, y);
  if (!r.ok) throw new Error(`${type} at ${x},${y}: ${r.reason}`);
  return r.building;
}

/** World with a road along row 4, plenty of materials and the given tier unlocked. */
function world(unlockedTier = 1): GameState {
  const s = testState(undefined, 30);
  s.unlockedTier = unlockedTier;
  for (const [x, y] of lPath(2, 4, 29, 4)) place(s, 'road', x, y);
  Object.assign(s.goods, { wood: 50, planks: 50, stone: 50, fish: 50, bread: 50, lampOil: 50, candles: 50, books: 50 });
  return s;
}

/** A house that's already full of residents of its tier. */
function fullHouse(s: GameState, x: number, tier = 1): Building {
  const h = place(s, 'house', x, 5);
  h.tier = tier;
  h.residents = tierDef(tier).maxResidents;
  return h;
}

describe('tier unlocks', () => {
  it('unlocks Lamplighters at the castaway threshold, and never relocks', () => {
    const s = world();
    const need = tierDef(2).unlockResidents;
    for (let i = 0; i * 8 < need; i++) fullHouse(s, 6 + i * 2);
    advance(s, 0.2);
    expect(populationOfTier(s, 1)).toBeGreaterThanOrEqual(need);
    expect(s.unlockedTier).toBe(2);

    for (const b of s.buildings) if (b.type === 'house') b.residents = 0;
    advance(s, 0.2);
    expect(s.unlockedTier).toBe(2);
  });

  it('keeps tier 2 buildings locked until then', () => {
    const s = world();
    const check = canPlace(s, 'bakery', 10, 6);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toMatch(/Lamplighters/);
    s.unlockedTier = 2;
    expect(canPlace(s, 'bakery', 10, 6).ok).toBe(true);
  });
});

describe('house upgrades', () => {
  it('upgrades a full, content house once the next tier is unlocked and stocked', () => {
    const s = world(2);
    const h = fullHouse(s, 8);
    const planks = s.goods.planks;
    advance(s, BALANCE.upgradeDelay + 1);
    expect(h.tier).toBe(2);
    expect(s.goods.planks).toBe(planks - (tierDef(2).upgradeCost.planks ?? 0));
  });

  it('pays more tax at a higher tier', () => {
    const s = world(3);
    const low = fullHouse(s, 8, 1);
    const high = fullHouse(s, 12, 2);
    high.residents = low.residents;
    advance(s, 1);
    expect(houseTax(s, high)).toBeGreaterThan(houseTax(s, low));
  });

  it('explains what blocks an upgrade', () => {
    const s = world(1);
    const h = fullHouse(s, 8);
    advance(s, 1);
    expect(upgradeBlocker(s, h)).toMatch(/unlock at/);

    s.unlockedTier = 2;
    h.residents = 3;
    expect(upgradeBlocker(s, h)).toMatch(/full/);

    h.residents = 8;
    s.goods.bread = 0;
    expect(upgradeBlocker(s, h)).toMatch(/bread/);

    s.goods.bread = 50;
    s.goods.planks = 0;
    expect(upgradeBlocker(s, h)).toMatch(/costs/);

    s.goods.planks = 50;
    expect(upgradeBlocker(s, h)).toBeNull();
  });

  it('does not upgrade while needs are unmet', () => {
    const s = world(2);
    s.goods.fish = 0;
    const h = fullHouse(s, 8);
    advance(s, BALANCE.upgradeDelay + 10);
    expect(h.tier).toBe(1);
  });

  it('stops at the top tier', () => {
    const s = world(3);
    const h = fullHouse(s, 8, 3);
    advance(s, BALANCE.upgradeDelay + 1);
    expect(h.tier).toBe(3);
    expect(upgradeBlocker(s, h)).toMatch(/highest/);
  });
});

describe('luxury services', () => {
  it('gives a tax bonus to houses near their tier’s service building', () => {
    const s = world();
    const near = fullHouse(s, 8);
    const far = fullHouse(s, 24);
    place(s, 'shrine', 7, 3);
    advance(s, 1);
    expect(hasLuxury(s, near)).toBe(true);
    expect(hasLuxury(s, far)).toBe(false);
    expect(houseTax(s, near)).toBeCloseTo(houseTax(s, far) * (1 + BALANCE.luxuryTaxBonus));
  });

  it('only helps the tier it belongs to', () => {
    const s = world(2);
    const h = fullHouse(s, 8, 2);
    place(s, 'shrine', 7, 3);
    advance(s, 1);
    expect(hasLuxury(s, h)).toBe(false);
  });

  it('needs a road to work', () => {
    const s = world();
    const h = fullHouse(s, 8);
    place(s, 'shrine', 9, 9); // in range, but no road
    advance(s, 1);
    expect(hasLuxury(s, h)).toBe(false);
  });
});

describe('tier 2 and 3 chains', () => {
  it('turns flour into bread and paper with ink into books', () => {
    const s = world(3);
    s.goods.flour = 5;
    s.goods.paper = 5;
    s.goods.ink = 5;
    s.goods.bread = 0;
    s.goods.books = 0;
    place(s, 'bakery', 6, 5);
    place(s, 'bookbinder', 10, 5);
    advance(s, 26);
    expect(s.goods.bread).toBeGreaterThan(0);
    expect(s.goods.books).toBeGreaterThan(0);
    expect(taxPerMinute(s)).toBe(0); // no houses yet
  });
});

describe('service status', () => {
  it('flags a service building with no road', () => {
    const s = world();
    const lonely = place(s, 'shrine', 9, 9);
    const linked = place(s, 'shrine', 12, 5);
    advance(s, 0.2);
    expect(lonely.status).toBe('unconnected');
    expect(linked.status).toBe('working');
  });
});
