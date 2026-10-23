import { describe, expect, it } from 'vitest';
import { lPath, placeBuilding } from '../src/sim/build';
import { goodsFlow } from '../src/sim/economy';
import { checkObjectives, MEDIUM_GOALS, objectives, SHORT_GOALS } from '../src/sim/objectives';
import { addBuilding, type GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import type { BuildingId } from '../src/data/buildings';
import { BUILDINGS } from '../src/data/buildings';
import { TIERS } from '../src/data/tiers';
import { testState } from './helpers';

function place(s: GameState, type: BuildingId, x: number, y: number) {
  const r = placeBuilding(s, type, x, y);
  if (!r.ok) throw new Error(`${type} at ${x},${y}: ${r.reason}`);
  return r.building;
}

describe('objectives', () => {
  it('have unique ids', () => {
    const ids = [...SHORT_GOALS, ...MEDIUM_GOALS].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('start with a road, and move on when it is done', () => {
    const s = testState(undefined, 20, { dark: true });
    expect(objectives(s).short?.id).toBe('road');
    expect(objectives(s).medium?.id).toBe('tier2');
    expect(objectives(s).medium?.progress).toEqual({ have: 0, need: 30 });

    for (const [x, y] of lPath(2, 4, 8, 4)) s.buildings.push({ id: s.nextId++, type: 'road', x, y, status: 'ok' });
    s.rev++;
    advance(s, 1);
    expect(s.goals).toContain('road');
    expect(objectives(s).short?.id).toBe('house');
    const done = s.events.filter((e) => e.kind === 'goal');
    expect(done.map((e) => e.text)).toEqual(['Lay a road from the warehouse']);
  });

  it('finish goals that are not on show quietly, and skip them later', () => {
    const s = testState();
    for (const [x, y] of lPath(2, 4, 19, 4)) place(s, 'road', x, y);
    place(s, 'sawmill', 6, 5); // done before its turn
    advance(s, 1);
    expect(s.goals).toEqual(expect.arrayContaining(['road', 'sawmill']));
    expect(s.events.filter((e) => e.kind === 'goal').map((e) => e.text)).toEqual(['Lay a road from the warehouse']);
    place(s, 'house', 4, 5);
    advance(s, 1);
    // The woodcutter is next; the sawmill is not offered again.
    expect(objectives(s).short?.id).toBe('woodcutter');
  });

  it('never take back a finished goal', () => {
    const s = testState();
    for (const [x, y] of lPath(2, 4, 8, 4)) place(s, 'road', x, y);
    checkObjectives(s);
    expect(s.goals).toContain('road');
    s.buildings = s.buildings.filter((b) => b.type !== 'road');
    s.rev++;
    checkObjectives(s);
    expect(s.goals).toContain('road');
    expect(objectives(s).short?.id).not.toBe('road');
  });

  it('offer tier goals only once the tier is unlocked', () => {
    const s = testState();
    s.goals = SHORT_GOALS.filter((g) => !g.when).map((g) => g.id);
    expect(objectives(s).short).toBeNull();
    s.unlockedTier = 2;
    expect(objectives(s).short?.id).toBe('bread');
  });

  it('follow the journals to the bell', () => {
    const s = testState();
    s.goals = ['tier2', 'tier3'];
    s.unlockedTier = 3;
    s.sites.push(
      { id: 1, kind: 'journal', x: 15, y: 15, found: false },
      { id: 2, kind: 'journal', x: 16, y: 15, found: false },
      { id: 3, kind: 'bell', x: 18, y: 18, found: false },
    );
    expect(objectives(s).medium?.id).toBe('journal');
    s.sites[0].found = true;
    checkObjectives(s);
    expect(objectives(s).medium).toMatchObject({ id: 'trail', text: 'Find the next journal', progress: { have: 1, need: 2 } });
    s.sites[2].found = true;
    checkObjectives(s);
    expect(objectives(s).medium?.id).toBe('bellPage');
  });
});

describe('goods flow', () => {
  it('counts what houses eat and what working buildings make', () => {
    const s = testState();
    for (const [x, y] of lPath(2, 4, 19, 4)) place(s, 'road', x, y);
    const h = place(s, 'house', 4, 5);
    h.residents = 4;
    place(s, 'sawmill', 10, 5);
    advance(s, 1);
    const flow = goodsFlow(s);
    const fishRate = TIERS[0].needs.find((n) => n.good === 'fish')!.rate;
    expect(flow.fish.used).toBeCloseTo(4 * fishRate);
    const saw = BUILDINGS.sawmill.production!;
    expect(flow.planks.made).toBeCloseTo((saw.amount * 60) / saw.cycle);
    expect(flow.wood.used).toBeGreaterThan(0);
  });

  it('counts fuel burned by lights', () => {
    const s = testState();
    for (const [x, y] of lPath(2, 4, 19, 4)) place(s, 'road', x, y);
    addBuilding(s, 'brazier', 6, 5);
    advance(s, 0.5);
    expect(goodsFlow(s).wood.used).toBeCloseTo(BUILDINGS.brazier.light!.burn);
  });
});
