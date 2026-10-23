import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { placeBuilding } from '../src/sim/build';
import { taxPerMinute, upkeepPerMinute } from '../src/sim/economy';
import type { BuildingId } from '../src/data/buildings';
import { lPath } from '../src/sim/build';
import { population, type GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { testState } from './helpers';

function place(s: GameState, type: BuildingId, x: number, y: number) {
  const r = placeBuilding(s, type, x, y);
  if (!r.ok) throw new Error(`${type} at ${x},${y}: ${r.reason}`);
  return r.building;
}

/** Road along row 4 from the warehouse (at 2,2) out to the right. */
function mainRoad(s: GameState, toX = 19) {
  for (const [x, y] of lPath(2, 4, toX, 4)) place(s, 'road', x, y);
}

describe('production', () => {
  it('produces goods into the warehouse when connected', () => {
    const s = testState();
    mainRoad(s);
    place(s, 'sawmill', 6, 5);
    const wood = s.goods.wood;
    const planks = s.goods.planks;
    advance(s, BUILDINGS.sawmill.production!.cycle + 0.5);
    // One cycle finished, and the next one already took its wood.
    expect(s.goods.wood).toBe(wood - 2);
    expect(s.goods.planks).toBe(planks + 1);
  });

  it('stops without a road, without inputs, and when storage is full', () => {
    const s = testState();
    const lonely = place(s, 'sawmill', 12, 12);
    advance(s, 1);
    expect(lonely.status).toBe('unconnected');

    mainRoad(s);
    const mill = place(s, 'sawmill', 6, 5);
    s.goods.wood = 0;
    advance(s, 1);
    expect(mill.status).toBe('noInput');

    s.goods.wood = 10;
    s.goods.planks = 60;
    advance(s, 1);
    expect(mill.status).toBe('storageFull');
    expect(s.goods.wood).toBe(10); // didn't waste inputs
  });

  it('scales harvester speed with nearby resources', () => {
    const rows = Array.from({ length: 20 }, (_, y) => (y >= 6 && y <= 12 ? '.......TTTTTTTTTTTTT' : '....................'));
    const s = testState(rows);
    mainRoad(s);
    const rich = place(s, 'woodcutter', 12, 5);
    // A poor woodcutter with only a sliver of forest in reach.
    const poorRows = rows.map((r, y) => (y >= 6 && y <= 12 ? '..................TT' : r));
    const p = testState(poorRows);
    mainRoad(p);
    const poor = place(p, 'woodcutter', 15, 5);

    const start = s.goods.wood;
    const pStart = p.goods.wood;
    advance(s, 120);
    advance(p, 120);
    expect(rich.status).toBe('working');
    expect(s.goods.wood - start).toBeGreaterThan(p.goods.wood - pStart);
    expect(poor.status).toBe('working');
  });
});

describe('houses and money', () => {
  it('grows residents and pays tax while fish and wood are in stock', () => {
    const s = testState();
    mainRoad(s);
    s.goods.fish = 50;
    s.goods.wood = 50;
    const house = place(s, 'house', 8, 5);
    advance(s, 120);
    expect(house.residents).toBe(8);
    expect(house.status).toBe('ok');
    expect(taxPerMinute(s)).toBeGreaterThan(0);
    expect(s.goods.fish).toBeLessThan(50);
  });

  it('stops paying tax when needs run out, and caps growth', () => {
    const s = testState();
    mainRoad(s);
    s.goods.fish = 0;
    const house = place(s, 'house', 8, 5);
    advance(s, 120);
    expect(house.status).toBe('needsUnmet');
    expect(house.residents).toBe(2); // starter residents only
    expect(taxPerMinute(s)).toBe(0);
    expect(population(s)).toBe(2);
  });

  it('charges upkeep over time', () => {
    const s = testState();
    mainRoad(s);
    place(s, 'sawmill', 6, 5);
    s.goods.wood = 0;
    const coins = s.coins;
    advance(s, 60);
    expect(coins - s.coins).toBeCloseTo(upkeepPerMinute(s), 1);
  });

  it('unconnected houses get no residents', () => {
    const s = testState();
    s.goods.fish = 50;
    const house = place(s, 'house', 12, 12);
    advance(s, 60);
    expect(house.residents).toBe(0);
    expect(house.status).toBe('unconnected');
  });
});
