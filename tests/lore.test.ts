import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { BUILDINGS } from '../src/data/buildings';
import { BELL_PAGE, PAGES } from '../src/data/lore';
import { canPlace, lPath, placeBuilding } from '../src/sim/build';
import { isLit, lightRadius } from '../src/sim/fog';
import {
  answerStone,
  bellBlocker,
  codexProgress,
  nextLegacy,
  productionMultiplier,
  ringBell,
  type Site,
  type SiteKind,
} from '../src/sim/lore';
import { Terrain } from '../src/sim/map';
import { dreadRate, unlockThreshold } from '../src/sim/population';
import { addBuilding, createGame, type GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { testState } from './helpers';

const SEEDS = ['fog', 'lantern', 'bell', 'a', 'whisper'];

function addSite(s: GameState, kind: SiteKind, x: number, y: number, extra: Partial<Site> = {}): Site {
  const site: Site = { id: s.sites.length + 1, kind, x, y, found: false, ...extra };
  s.sites.push(site);
  s.rev++;
  return site;
}

describe('placing secrets', () => {
  it.each(SEEDS)('scatters secrets across reachable land, out of the starting light (seed %s)', (seed) => {
    const s = createGame(seed);
    const kinds = (k: SiteKind) => s.sites.filter((x) => x.kind === k);
    expect(kinds('bell')).toHaveLength(1);
    expect(kinds('journal').length).toBeGreaterThanOrEqual(PAGES.length);
    expect(kinds('ruin').length).toBeGreaterThan(2);
    expect(kinds('relic').length).toBeGreaterThan(0);
    expect(s.map.terrain[kinds('bell')[0].y * s.map.width + kinds('bell')[0].x]).toBe(Terrain.Coast);
    for (const site of s.sites) {
      expect(s.map.terrain[site.y * s.map.width + site.x]).not.toBe(Terrain.Water);
      expect(isLit(s, site.x, site.y)).toBe(false);
      expect(site.found).toBe(false);
    }
    expect(createGame(seed).sites).toEqual(s.sites);
  });

  it('does not place relics you already own', () => {
    const s = createGame('fog', { cycle: 2, relics: ['ember', 'wick', 'veil'], codex: {}, echoes: [] });
    const relics = s.sites.filter((x) => x.kind === 'relic').map((x) => x.relic);
    for (const r of ['ember', 'wick', 'veil']) expect(relics).not.toContain(r);
  });

  it('blocks building on undiscovered secrets', () => {
    const s = testState();
    addSite(s, 'ruin', 10, 10);
    const check = canPlace(s, 'house', 10, 10);
    expect(check.ok).toBe(false);
  });
});

describe('discovering secrets', () => {
  it('light reveals ruins (salvage), journals (pages in order) and relics', () => {
    const s = testState();
    s.coins = 0;
    const ruin = addSite(s, 'ruin', 10, 10);
    addSite(s, 'journal', 12, 10);
    addSite(s, 'journal', 14, 10);
    addSite(s, 'relic', 16, 10, { relic: 'ember' });
    advance(s, 0.2);
    expect(ruin.found).toBe(true);
    expect(s.coins).toBeGreaterThan(0);
    expect(s.codex[PAGES[0].id]).toBe('read');
    expect(s.codex[PAGES[1].id]).toBe('read');
    expect(s.codex[PAGES[2].id]).toBeUndefined();
    expect(s.relics).toContain('ember');
    expect(s.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['find', 'page', 'relic']));
    // Found secrets don't block building any more.
    expect(canPlace(s, 'road', 10, 10).ok).toBe(true);
  });

  it('only discovers secrets once light reaches them', () => {
    const s = testState(undefined, 40, { dark: true });
    addBuilding(s, 'lantern', 5, 5);
    const near = addSite(s, 'ruin', 8, 5);
    const far = addSite(s, 'ruin', 30, 30);
    advance(s, 0.2);
    expect(near.found).toBe(true);
    expect(far.found).toBe(false);
  });

  it('an Archive deciphers pages written in cipher', () => {
    const s = testState(undefined, 30);
    s.unlockedTier = 3;
    Object.assign(s.goods, { planks: 50, stone: 50 });
    for (const p of PAGES.filter((p) => !p.encrypted)) s.codex[p.id] = 'read';
    addSite(s, 'journal', 20, 20);
    advance(s, 0.2);
    const cipher = PAGES.find((p) => p.encrypted)!;
    expect(s.codex[cipher.id]).toBe('found');

    for (const [x, y] of lPath(2, 4, 12, 4)) placeBuilding(s, 'road', x, y);
    const res = placeBuilding(s, 'archive', 6, 5);
    expect(res.ok).toBe(true);
    advance(s, BALANCE.decipherTime + 1);
    expect(s.codex[cipher.id]).toBe('read');
    expect(codexProgress(s).read).toBe(PAGES.filter((p) => !p.encrypted).length + 1);
  });
});

describe('whispering stones', () => {
  it('accepting speeds up production and raises dread everywhere; refusing does nothing', () => {
    const s = testState();
    const a = addSite(s, 'stone', 10, 10);
    const b = addSite(s, 'stone', 14, 14);
    advance(s, 0.2);
    const house = addBuilding(s, 'house', 6, 10);
    advance(s, 0.2);
    const calm = dreadRate(s, house);
    expect(productionMultiplier(s)).toBe(1);

    expect(answerStone(s, a.id, true)).toBe(true);
    expect(answerStone(s, a.id, false)).toBe(false); // already answered
    expect(productionMultiplier(s)).toBeCloseTo(1 + BALANCE.pactProduction);
    expect(dreadRate(s, house)).toBeCloseTo(calm + BALANCE.pactDread);

    answerStone(s, b.id, false);
    expect(s.pacts).toBe(1);
    // Stones stay where they are.
    expect(canPlace(s, 'road', 10, 10).ok).toBe(false);
  });
});

describe('the Drowned Bell', () => {
  it('rings only when found, lit, and the last cipher has been read', () => {
    const s = testState();
    expect(bellBlocker(s)).toMatch(/not found/);
    addSite(s, 'bell', 10, 10);
    advance(s, 0.2);
    expect(bellBlocker(s)).toMatch(/do not know/);
    s.codex[BELL_PAGE] = 'found';
    expect(bellBlocker(s)).toMatch(/Archive/);
    expect(ringBell(s)).toBe(false);
    s.codex[BELL_PAGE] = 'read';
    expect(bellBlocker(s)).toBeNull();
    expect(ringBell(s)).toBe(true);
    expect(s.bellRung).toBe(true);
  });

  it('needs light on the shore', () => {
    const s = testState(undefined, 40, { dark: true });
    addBuilding(s, 'lantern', 5, 5);
    const bell = addSite(s, 'bell', 30, 30);
    bell.found = true;
    s.codex[BELL_PAGE] = 'read';
    expect(bellBlocker(s)).toMatch(/light/);
  });
});

describe('the next cycle', () => {
  it('keeps relics, the codex and the names of the lost; loses everything else', () => {
    const s = createGame('fog');
    s.relics.push('ember');
    s.codex[PAGES[0].id] = 'read';
    s.lostNames.push('Ada', 'Bram');
    s.coins = 99999;
    const legacy = nextLegacy(s);
    const next = createGame('fog-2', legacy);
    expect(next.cycle).toBe(2);
    expect(next.relics).toEqual(['ember']);
    expect(next.codex[PAGES[0].id]).toBe('read');
    expect(next.echoes).toEqual(['Ada', 'Bram']);
    expect(next.coins).toBe(BALANCE.startCoins);
    expect(next.buildings.map((b) => b.type).sort()).toEqual(['lantern', 'warehouse']);
    // Knowledge: tiers unlock sooner.
    expect(unlockThreshold(next, 2)).toBeLessThan(unlockThreshold(s, 2));
  });

  it('relics change the rules: the Ember lights further, the Wick burns less', () => {
    const s = testState(undefined, 40, { dark: true });
    const lantern = addBuilding(s, 'lantern', 5, 5);
    for (const [x, y] of lPath(2, 4, 12, 4)) addBuilding(s, 'road', x, y);
    s.goods.wood = 50;
    const brazier = addBuilding(s, 'brazier', 9, 5);
    advance(s, 5);
    const before = lightRadius(s, lantern);
    s.relics.push('ember', 'wick');
    expect(lightRadius(s, lantern)).toBe(before + 1);
    const wood = s.goods.wood;
    advance(s, 60);
    expect(wood - s.goods.wood).toBeCloseTo(BUILDINGS.brazier.light!.burn * 0.75, 1);
    expect(brazier.status).toBe('working');
  });
});

describe('the lost', () => {
  it('are named when they walk into the fog, and speak in the surge', () => {
    const s = testState();
    const h = addBuilding(s, 'house', 6, 10);
    h.residents = 3;
    h.dread = 99.9;
    h.supply = { fish: 0, wood: 0 };
    advance(s, 1);
    expect(s.lostNames).toHaveLength(3);

    s.events.length = 0;
    s.tolling = { phase: 'surge', timer: 60, strength: 1, count: 1 };
    advance(s, BALANCE.firstWhisper + 1);
    const whisper = s.events.find((e) => e.kind === 'whisper');
    expect(whisper).toBeDefined();
    expect(s.lostNames.some((n) => whisper!.text.includes(n))).toBe(true);
  });
});
