import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import type { GoodId } from '../src/data/goods';
import { TIERS, tierDef } from '../src/data/tiers';
import { canAfford, canPlace, placeBuilding } from '../src/sim/build';
import { centre as centreOf } from '../src/sim/state';
import { isLit, litGrid } from '../src/sim/fog';
import { productionMultiplier } from '../src/sim/lore';
import { taxPerMinute, upkeepPerMinute } from '../src/sim/economy';
import { isLand, Terrain } from '../src/sim/map';
import { servedBy } from '../src/sim/population';
import { derived, populationOfTier, type Building, type GameState } from '../src/sim/state';

/**
 * A simple automated player for balance playtests. Not part of the game.
 *
 * It lays roads on a fixed grid every 5 tiles, aligned to the warehouse, so every
 * 4x4 block between roads holds four 2x2 buildings that each touch a road.
 * Each turn it builds what the goods flow says is short, adds houses while the
 * colony keeps up, covers houses with services, and pushes the light outward
 * with braziers when it runs out of room or needs other terrain.
 *
 * It plays faster and more evenly than a person would: treat its times as a lower bound.
 */

const GRID = 5;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Which building makes each good, in the order the bot cares about them. */
const MAKER: Partial<Record<GoodId, BuildingId>> = {
  wood: 'woodcutter',
  fish: 'fishery',
  planks: 'sawmill',
  stone: 'quarry',
  wheat: 'wheatFarm',
  flour: 'mill',
  bread: 'bakery',
  blubber: 'whaler',
  lampOil: 'rendery',
  wax: 'apiary',
  candles: 'chandlery',
  reeds: 'reedCutter',
  paper: 'paperMill',
  ink: 'inkBoat',
  books: 'bookbinder',
};

export interface BotOptions {
  /** Seconds of game time between turns. */
  turn?: number;
  /** Most buildings placed per turn. */
  actionsPerTurn?: number;
  /** Lowest resource efficiency the bot accepts for a harvester. */
  minEfficiency?: number;
}

export class Bot {
  readonly log: string[] = [];
  private ox: number;
  private oy: number;
  private opts: Required<BotOptions>;
  private actions = 0;
  /** Terrain that harvesters found no good spot for; light is pushed toward it, taking turns. */
  private wants: (readonly Terrain[])[] = [];
  private turnCount = 0;

  constructor(
    private s: GameState,
    opts: BotOptions = {},
  ) {
    this.opts = { turn: 5, actionsPerTurn: 3, minEfficiency: 0.45, ...opts };
    const w = s.buildings.find((b) => b.type === 'warehouse')!;
    this.ox = mod(w.x - 1, GRID);
    this.oy = mod(w.y - 1, GRID);
  }

  get turn(): number {
    return this.opts.turn;
  }

  private note(msg: string): void {
    this.log.push(`${Math.floor(this.s.time / 60)}:${String(Math.floor(this.s.time % 60)).padStart(2, '0')} ${msg}`);
  }

  private isGrid(x: number, y: number): boolean {
    return mod(x - this.ox, GRID) === 0 || mod(y - this.oy, GRID) === 0;
  }

  /** One turn of decisions. */
  act(): void {
    this.actions = 0;
    this.buildRoads();
    const s = this.s;
    // Double fuel through a surge if the stores can take it.
    s.doubleFuel = s.tolling.phase !== 'calm' && s.goods.wood > 40 && (s.unlockedTier < 2 || s.goods.lampOil > 15);

    this.wants = [];
    this.turnCount++;
    this.ensureStarters();
    this.ensureProduction();
    this.ensureServices();
    this.growHouses();
    this.expandLight();
  }

  // -------------------------------------------------------------------------
  // Roads

  /** Lay road on every lit grid tile reachable from the network. Roads are cheap. */
  private buildRoads(): void {
    const s = this.s;
    const W = s.map.width;
    const d = derived(s);
    const seen = new Uint8Array(W * s.map.height);
    /** Forest tiles crossed in a row to reach a tile. Roads skirt woods rather than clear them. */
    const depth = new Uint8Array(W * s.map.height);
    const queue: number[] = [];
    for (let i = 0; i < d.roadNet.length; i++) if (d.roadNet[i]) queue.push(i);
    // Seed from the warehouses' edges too, for the very first road.
    for (const b of s.buildings) {
      if (b.type !== 'warehouse') continue;
      for (let y = b.y - 1; y <= b.y + 2; y++) for (let x = b.x - 1; x <= b.x + 2; x++) if (this.isGrid(x, y)) queue.push(y * W + x);
    }
    let placed = 0;
    while (queue.length && placed < 80) {
      const i = queue.pop()!;
      if (seen[i]) continue;
      seen[i] = 1;
      const x = i % W;
      const y = (i - x) / W;
      const occ = d.occ[i] ? derived(s).byId.get(derived(s).occ[i]) : undefined;
      if (occ?.type !== 'road') {
        if (s.coins < 40) return;
        if (!canPlace(s, 'road', x, y).ok) continue;
        if (!placeBuilding(s, 'road', x, y).ok) continue;
        placed++;
      }
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= s.map.height) continue;
        const j = ny * W + nx;
        if (!this.isGrid(nx, ny) || seen[j]) continue;
        const forest = s.map.terrain[j] === Terrain.Forest && !d.occ[j];
        if (forest && depth[i] >= 1) continue;
        depth[j] = forest ? depth[i] + 1 : 0;
        queue.push(j);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Finding spots

  /** Free, lit, road-connected spots for a building, best first. */
  private spots(type: BuildingId, score: (x: number, y: number, eff: number) => number): { x: number; y: number; score: number }[] {
    const s = this.s;
    const W = s.map.width;
    const d = derived(s);
    const [w, h] = BUILDINGS[type].size;
    // Harvesters may sit anywhere off the road grid, to get close to the sea or the soil they need.
    // Everything else keeps to the block corners so blocks pack neatly.
    const free = !!BUILDINGS[type].resource;
    const offsetOk = (o: number, size: number) => (free ? o >= 1 && o + size - 1 <= GRID - 1 : o === 1 || o === 3);
    const out: { x: number; y: number; score: number }[] = [];
    for (let y = 1; y < s.map.height - 2; y++) {
      if (!offsetOk(mod(y - this.oy, GRID), h)) continue;
      for (let x = 1; x < W - 2; x++) {
        if (!offsetOk(mod(x - this.ox, GRID), w)) continue;
        if (!isLit(s, x, y)) continue;
        // Must touch a connected road.
        let touches = false;
        for (let tx = x - 1; tx <= x + w && !touches; tx++) {
          for (let ty = y - 1; ty <= y + h && !touches; ty++) {
            const edge = (tx === x - 1 || tx === x + w) !== (ty === y - 1 || ty === y + h);
            if (edge && tx >= 0 && ty >= 0 && tx < W && ty < s.map.height && d.roadNet[ty * W + tx]) touches = true;
          }
        }
        if (!touches) continue;
        const check = canPlace(s, type, x, y);
        if (!check.ok && check.reason !== 'Not enough resources.') continue;
        out.push({ x, y, score: score(x, y, check.efficiency ?? 1) });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }

  private place(type: BuildingId, score: (x: number, y: number, eff: number) => number, why: string, minScore = -Infinity): Building | null {
    if (this.actions >= this.opts.actionsPerTurn || !canAfford(this.s, type)) return null;
    const best = this.spots(type, score)[0];
    if (!best || best.score < minScore) return null;
    const res = placeBuilding(this.s, type, best.x, best.y);
    if (!res.ok) return null;
    this.actions++;
    this.note(`${BUILDINGS[type].name} (${why})`);
    return res.building;
  }

  /** Spots close to the warehouse score higher, so the town stays compact. */
  private nearHome(x: number, y: number): number {
    const w = this.s.buildings.find((b) => b.type === 'warehouse')!;
    return -Math.hypot(x - w.x, y - w.y);
  }

  // -------------------------------------------------------------------------
  // Production

  /** Capacity per minute of the buildings that make each good, and demand on it. */
  private balance(): Record<string, { supply: number; demand: number }> {
    const s = this.s;
    const d = derived(s);
    const mult = productionMultiplier(s);
    const r: Record<string, { supply: number; demand: number }> = {};
    const at = (g: string) => (r[g] ??= { supply: 0, demand: 0 });
    for (const b of s.buildings) {
      const def = BUILDINGS[b.type];
      if (def.production) {
        const perMin = (60 / def.production.cycle) * (d.efficiency.get(b.id) ?? 1) * mult;
        at(def.production.output).supply += def.production.amount * perMin;
        for (const [g, n] of Object.entries(def.production.inputs)) at(g).demand += (n ?? 0) * perMin;
      }
      if (def.light?.fuel) at(def.light.fuel).demand += def.light.burn;
      if (b.type === 'house') {
        // Plan for full houses, so supply leads growth instead of trailing it.
        const tier = tierDef(b.tier ?? 1);
        for (const n of tier.needs) at(n.good).demand += tier.maxResidents * n.rate;
      }
    }
    // Once a tier is unlocked, houses will upgrade into it: stock its goods ahead of time.
    for (const t of TIERS) {
      if (t.id > s.unlockedTier || t.id === 1) continue;
      for (const n of t.needs) at(n.good).demand = Math.max(at(n.good).demand, t.maxResidents * n.rate * 2);
    }
    // Room for the next Castaway house, so growth never waits on food.
    for (const n of tierDef(1).needs) at(n.good).demand += tierDef(1).maxResidents * n.rate;
    // Building materials: a steady trickle, and wood for new houses and braziers.
    // Running low means building and upgrading eat more than we thought: plan for more.
    const houses = s.buildings.filter((b) => b.type === 'house').length;
    at('planks').demand += 1.5 + houses * 0.1 + (s.goods.planks < 15 ? 3 : 0);
    at('wood').demand += 2;
    if (s.unlockedTier >= 2) at('stone').demand += 1 + (s.goods.stone < 10 ? 2 : 0);
    return r;
  }

  private want(t: readonly Terrain[]): void {
    if (!this.wants.includes(t)) this.wants.push(t);
  }

  /** Like a player following the goals: one of each building in a newly opened chain, first. */
  private ensureStarters(): void {
    const s = this.s;
    const chains: BuildingId[][] = [
      [],
      ['quarry', 'wheatFarm', 'mill', 'bakery', 'whaler', 'rendery'],
      ['apiary', 'chandlery', 'reedCutter', 'paperMill', 'inkBoat', 'bookbinder'],
    ];
    for (let t = 2; t <= s.unlockedTier; t++) {
      for (const type of chains[t - 1]) {
        if (s.buildings.some((b) => b.type === type)) continue;
        if (s.coins < BUILDINGS[type].cost.coins + 60) return;
        const res = BUILDINGS[type].resource;
        const built = this.place(type, (x, y, eff) => (res ? eff * 100 : 0) + this.nearHome(x, y) * 0.5, 'new chain', res ? 20 - 1000 : -Infinity);
        if (!built) {
          if (res) this.want(res.terrain);
          return;
        }
      }
    }
  }

  private ensureProduction(): void {
    const s = this.s;
    const bal = this.balance();
    // Order matters: fuel and food before luxuries, raw goods are handled by demand from their users.
    const order: GoodId[] = ['wood', 'fish', 'planks', 'stone', 'bread', 'flour', 'wheat', 'lampOil', 'blubber', 'candles', 'wax', 'books', 'paper', 'reeds', 'ink'];
    for (const g of order) {
      const maker = MAKER[g];
      if (!maker || BUILDINGS[maker].tier > s.unlockedTier) continue;
      const { supply, demand } = bal[g] ?? { supply: 0, demand: 0 };
      if (supply >= demand * 1.1) continue;
      // Leave expensive chains alone while money is short, except fuel and food.
      if (!['wood', 'fish'].includes(g) && s.coins < BUILDINGS[maker].cost.coins + this.reserve()) continue;
      const res = BUILDINGS[maker].resource;
      const built = this.place(
        maker,
        (x, y, eff) => (res ? eff * 100 : 0) + this.nearHome(x, y) * (res ? 0.5 : 1),
        `${g} ${supply.toFixed(1)}/${demand.toFixed(1)} per min`,
        res ? 25 : -Infinity,
      );
      if (built && res && (derived(s).efficiency.get(built.id) ?? 0) < this.opts.minEfficiency) {
        // A poor spot: keep it, but look for better ground.
        this.want(res.terrain);
      }
      if (!built && res && canAfford(s, maker)) this.want(res.terrain);
      if (this.actions >= this.opts.actionsPerTurn) return;
    }
  }

  // -------------------------------------------------------------------------
  // Houses and services

  /** Coins kept back for emergencies (a woodcutter, a fishery, fuel). */
  private reserve(): number {
    return 100 + this.s.buildings.filter((b) => b.type !== 'road').length;
  }

  private growHouses(): void {
    const s = this.s;
    const houses = s.buildings.filter((b) => b.type === 'house');
    const filling = houses.filter((b) => (b.residents ?? 0) < tierDef(b.tier ?? 1).maxResidents).length;
    const unhappy = houses.filter((b) => b.status === 'needsUnmet' || b.status === 'dark').length;
    if (filling >= 2 || unhappy > 0) return;
    // Keep a few spots free, so there is always somewhere for the next brazier or workshop.
    if (this.freeSlots() <= 3) return;
    // Only grow while Castaway goods can carry one more full house.
    const bal = this.balance();
    const t1 = tierDef(1);
    for (const n of t1.needs) {
      const b = bal[n.good] ?? { supply: 0, demand: 0 };
      if (houses.length > 1 && b.supply < b.demand) return;
      if (houses.length > 1 && s.goods[n.good] < 5) return;
    }
    const shrines = s.buildings.filter((b) => b.type === 'shrine');
    this.place(
      'house',
      (x, y) => this.nearHome(x, y) + (shrines.some((sh) => Math.max(Math.abs(sh.x - x - 1), Math.abs(sh.y - y - 1)) <= 5) ? 8 : 0),
      `${houses.length + 1} houses`,
    );
  }

  /** Shrines everywhere; taverns and archives once the tier has a few houses. */
  private ensureServices(): void {
    const s = this.s;
    const houses = s.buildings.filter((b) => b.type === 'house');
    const want: [BuildingId, (h: Building) => boolean][] = [
      ['shrine', () => true],
      ['tavern', (h) => (h.tier ?? 1) === 2],
      ['archive', (h) => (h.tier ?? 1) === 3],
    ];
    for (const [type, applies] of want) {
      if (BUILDINGS[type].tier > s.unlockedTier) continue;
      const unserved = houses.filter((h) => applies(h) && !servedBy(s, h, type));
      const needed = type === 'shrine' ? 3 : 2;
      if (unserved.length < needed) continue;
      if (type !== 'shrine' && s.coins < BUILDINGS[type].cost.coins + 200) continue;
      const r = BUILDINGS[type].serviceRadius!;
      const [w, h] = BUILDINGS[type].size;
      this.place(
        type,
        (x, y) =>
          unserved.filter((hs) => {
            const c = centreOf(hs);
            return Math.max(Math.abs(c.x - (x + w / 2)), Math.abs(c.y - (y + h / 2))) <= r;
          }).length,
        `${unserved.length} houses without one`,
        needed,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Light

  /** Free grid spots left for 2x2 buildings. */
  private freeSlots(): number {
    return this.spots('house', () => 0).length;
  }

  private expandLight(): void {
    const s = this.s;
    if (this.actions >= this.opts.actionsPerTurn || s.coins < 120) return;
    const crowded = this.freeSlots() < 6;
    const toward = this.wants.length ? this.wants[this.turnCount % this.wants.length] : null;
    // Ruins and journals are worth a little detour once the colony is comfortable.
    const unfound = s.coins > 1500 ? s.sites.filter((x) => !x.found && x.kind !== 'stone' && s.explored[x.y * s.map.width + x.x]) : [];
    if (!crowded && !toward && !unfound.length) return;

    const W = s.map.width;
    const lit = litGrid(s);
    const R = BUILDINGS.brazier.light!.radius;
    const targets: { x: number; y: number }[] = [];
    if (toward) {
      for (let i = 0; i < lit.length; i++) if (!lit[i] && toward.includes(s.map.terrain[i])) targets.push({ x: i % W, y: Math.floor(i / W) });
    } else if (!crowded) targets.push(...unfound);

    this.place(
      'brazier',
      (x, y) => {
        // New land this brazier would light...
        let fresh = 0;
        for (let ty = Math.floor(y - R); ty <= y + R + 1; ty++) {
          for (let tx = Math.floor(x - R); tx <= x + R + 1; tx++) {
            if (tx < 0 || ty < 0 || tx >= W || ty >= s.map.height) continue;
            const i = ty * W + tx;
            if (lit[i] || !isLand(s.map.terrain[i])) continue;
            if ((tx + 0.5 - (x + 0.5)) ** 2 + (ty + 0.5 - (y + 0.5)) ** 2 > R * R) continue;
            fresh += toward?.includes(s.map.terrain[i]) ? 4 : 1;
          }
        }
        // ...and how far it gets toward what we want.
        let near = 0;
        if (targets.length) {
          let best = Infinity;
          for (const t of targets) best = Math.min(best, Math.hypot(t.x - x, t.y - y));
          near = -best * 3;
        }
        return fresh > 0 ? fresh + near : -Infinity;
      },
      toward ? 'toward needed terrain' : crowded ? 'room to build' : 'toward something in the fog',
      -1e9,
    );
  }
}

/** A snapshot of how the colony is doing, for playtest reports. */
export function census(s: GameState): Record<string, number> {
  const houses = s.buildings.filter((b) => b.type === 'house');
  return {
    min: Math.round(s.time / 60),
    coins: Math.round(s.coins),
    t1: populationOfTier(s, 1),
    t2: populationOfTier(s, 2),
    t3: populationOfTier(s, 3),
    houses: houses.length,
    buildings: s.buildings.filter((b) => b.type !== 'road').length,
    lost: s.lost,
    lit: litGrid(s).reduce((a, v) => a + v, 0),
    tax: Math.round(taxPerMinute(s)),
    upkeep: Math.round(upkeepPerMinute(s)),
    unmet: houses.filter((b) => b.status === 'needsUnmet').length,
    dark: houses.filter((b) => b.status === 'dark').length,
    wood: Math.floor(s.goods.wood),
    fish: Math.floor(s.goods.fish),
    planks: Math.floor(s.goods.planks),
    bread: Math.floor(s.goods.bread),
    oil: Math.floor(s.goods.lampOil),
    stone: Math.floor(s.goods.stone),
    candles: Math.floor(s.goods.candles),
    books: Math.floor(s.goods.books),
  };
}
