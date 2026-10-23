import type { BuildingId } from '../data/buildings';
import { BELL_PAGE } from '../data/lore';
import { tierDef } from '../data/tiers';
import { litGrid } from './fog';
import { emit } from './lore';
import { Terrain } from './map';
import { unlockThreshold } from './population';
import { derived, populationOfTier, type GameState } from './state';

/**
 * The objective tracker: one short goal and one medium goal at a time (plan §5).
 * Goals are checked once per simulated second. A finished goal is remembered in
 * `state.goals`, so it never comes back even if its condition later fails.
 */

export interface Objective {
  id: string;
  text: string;
  /** How to do it, for the tooltip. */
  hint: string;
  progress?: { have: number; need: number };
}

interface GoalDef {
  id: string;
  text: string | ((s: GameState) => string);
  hint: string;
  /** Only offered once this holds (e.g. the tier is unlocked). */
  when?: (s: GameState) => boolean;
  done: (s: GameState) => boolean;
  progress?: (s: GameState) => [number, number];
}

function hasWorking(s: GameState, type: BuildingId): boolean {
  const d = derived(s);
  return s.buildings.some((b) => b.type === type && d.connected.has(b.id));
}

function journalsFound(s: GameState): [number, number] {
  const journals = s.sites.filter((x) => x.kind === 'journal');
  return [journals.filter((x) => x.found).length, journals.length];
}

/** Is any lit land tile right beside open water? */
function coastLit(s: GameState): boolean {
  const { width: W, height: H, terrain } = s.map;
  const lit = litGrid(s);
  for (let i = 0; i < lit.length; i++) {
    if (!lit[i] || terrain[i] === Terrain.Water) continue;
    const x = i % W;
    const y = (i - x) / W;
    if ((x > 0 && terrain[i - 1] === Terrain.Water) || (x < W - 1 && terrain[i + 1] === Terrain.Water)) return true;
    if ((y > 0 && terrain[i - W] === Terrain.Water) || (y < H - 1 && terrain[i + W] === Terrain.Water)) return true;
  }
  return false;
}

const bell = (s: GameState) => s.sites.find((x) => x.kind === 'bell');
const tier = (n: number) => (s: GameState) => s.unlockedTier >= n;
const houseOfTier = (n: number) => (s: GameState) => s.buildings.some((b) => b.type === 'house' && (b.tier ?? 1) >= n);

export const SHORT_GOALS: GoalDef[] = [
  { id: 'road', text: 'Lay a road from the warehouse', hint: 'Pick Road (R) and drag out from the warehouse.', done: (s) => hasWorking(s, 'road') },
  { id: 'house', text: 'Build a house by the road', hint: 'Houses (H) must touch a road that leads to the warehouse.', done: (s) => hasWorking(s, 'house') },
  { id: 'woodcutter', text: 'Build a woodcutter near forest', hint: 'Castaways need wood, and braziers burn it.', done: (s) => hasWorking(s, 'woodcutter') },
  { id: 'coast', text: 'Light a path to the coast', hint: 'Braziers (B) burn wood and push the fog back. Chain them toward the sea.', done: coastLit },
  { id: 'fishery', text: 'Build a fishery on the shore', hint: 'Fisheries need open water beside them. Castaways eat fish.', done: (s) => hasWorking(s, 'fishery') },
  { id: 'sawmill', text: 'Build a sawmill', hint: 'Sawmills turn wood into planks for bigger buildings.', done: (s) => hasWorking(s, 'sawmill') },
  { id: 'shrine', text: 'Build a shrine among your houses', hint: 'A shrine calms dread and raises Castaway tax.', done: (s) => hasWorking(s, 'shrine') },
  {
    id: 'bread',
    text: 'Bake bread',
    hint: 'Wheat farm on fertile soil → mill → bakery.',
    when: tier(2),
    done: (s) => hasWorking(s, 'bakery') && s.goods.bread >= 1,
  },
  {
    id: 'oil',
    text: 'Render lamp oil',
    hint: 'Whaler on the coast → rendery. Lamplighters and lanterns both want it.',
    when: tier(2),
    done: (s) => hasWorking(s, 'rendery') && s.goods.lampOil >= 1,
  },
  {
    id: 'lamplighters',
    text: 'Raise a Lamplighter house',
    hint: 'A full, content Castaway house upgrades once bread and lamp oil are in stock.',
    when: tier(2),
    done: houseOfTier(2),
  },
  { id: 'tavern', text: 'Build a tavern', hint: 'Taverns raise Lamplighter tax.', when: tier(2), done: (s) => hasWorking(s, 'tavern') },
  { id: 'quarry', text: 'Quarry stone', hint: 'Quarries need rock nearby. Scholars build with stone.', when: tier(2), done: (s) => hasWorking(s, 'quarry') },
  {
    id: 'candles',
    text: 'Make candles',
    hint: 'Apiary → chandlery.',
    when: tier(3),
    done: (s) => hasWorking(s, 'chandlery') && s.goods.candles >= 1,
  },
  {
    id: 'books',
    text: 'Bind books',
    hint: 'Reed cutter → paper mill, and an ink boat. Both feed the bookbinder.',
    when: tier(3),
    done: (s) => hasWorking(s, 'bookbinder') && s.goods.books >= 1,
  },
  { id: 'archive', text: 'Build an Archive', hint: 'Archives read pages in cipher and raise Scholar tax.', when: tier(3), done: (s) => hasWorking(s, 'archive') },
  { id: 'scholars', text: 'Raise a Scholar house', hint: 'A full, content Lamplighter house upgrades once candles and books are in stock.', when: tier(3), done: houseOfTier(3) },
];

export const MEDIUM_GOALS: GoalDef[] = [
  {
    id: 'tier2',
    text: (s) => `Reach ${unlockThreshold(s, 2)} ${tierDef(1).name}`,
    hint: 'Houses fill up while their needs are met. Lamplighters unlock at this number.',
    done: tier(2),
    progress: (s) => [populationOfTier(s, 1), unlockThreshold(s, 2)],
  },
  {
    id: 'journal',
    text: 'Find a journal in the fog',
    hint: 'Faint markers show where something waits. Bring light to one.',
    done: (s) => journalsFound(s)[0] >= 1,
  },
  {
    id: 'tier3',
    text: (s) => `Reach ${unlockThreshold(s, 3)} ${tierDef(2).name}`,
    hint: 'Scholars unlock at this number.',
    when: tier(2),
    done: tier(3),
    progress: (s) => [populationOfTier(s, 2), unlockThreshold(s, 3)],
  },
  {
    id: 'trail',
    text: 'Find the next journal',
    hint: 'The journals form a trail outward, toward the Drowned Bell.',
    done: (s) => !!bell(s)?.found || journalsFound(s)[0] >= journalsFound(s)[1],
    progress: journalsFound,
  },
  {
    id: 'bell',
    text: 'Bring light to the Drowned Bell',
    hint: 'It waits on the shore furthest from your landing.',
    done: (s) => !!bell(s)?.found,
  },
  {
    id: 'bellPage',
    text: 'Learn how to ring the bell',
    hint: 'The way is written in a page of cipher. An Archive can read it.',
    done: (s) => s.codex[BELL_PAGE] === 'read',
  },
  { id: 'ring', text: 'Ring the Drowned Bell', hint: 'Click the bell once its shore is lit.', done: (s) => s.bellRung },
];

function toObjective(s: GameState, def: GoalDef): Objective {
  const o: Objective = { id: def.id, text: typeof def.text === 'string' ? def.text : def.text(s), hint: def.hint };
  if (def.progress) {
    const [have, need] = def.progress(s);
    o.progress = { have: Math.min(have, need), need };
  }
  return o;
}

function current(s: GameState, list: GoalDef[]): GoalDef | undefined {
  return list.find((g) => !s.goals.includes(g.id) && (!g.when || g.when(s)));
}

/** The goals to show now: one short, one medium. Null once a list is finished. */
export function objectives(s: GameState): { short: Objective | null; medium: Objective | null } {
  const short = current(s, SHORT_GOALS);
  const medium = current(s, MEDIUM_GOALS);
  return { short: short ? toObjective(s, short) : null, medium: medium ? toObjective(s, medium) : null };
}

/** Mark finished goals. Only the goals on show announce themselves; the rest finish quietly. */
export function updateObjectives(s: GameState, dt: number): void {
  if (Math.floor(s.time + 1e-6) === Math.floor(s.time - dt + 1e-6)) return;
  checkObjectives(s);
}

export function checkObjectives(s: GameState): void {
  const shown = new Set([current(s, SHORT_GOALS)?.id, current(s, MEDIUM_GOALS)?.id]);
  for (const g of [...SHORT_GOALS, ...MEDIUM_GOALS]) {
    if (s.goals.includes(g.id) || (g.when && !g.when(s)) || !g.done(s)) continue;
    s.goals.push(g.id);
    if (shown.has(g.id)) emit(s, { kind: 'goal', title: 'Goal complete', text: toObjective(s, g).text });
  }
}
