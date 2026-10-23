import { BALANCE } from '../data/balance';
import type { GoodId } from '../data/goods';
import { BELL_PAGE, COMPANY_NAMES, PAGES, RESIDENT_NAMES, WHISPERS, type LorePage } from '../data/lore';
import { RELIC_IDS, RELICS, type RelicId } from '../data/relics';
import { isLit } from './fog';
import { Terrain } from './map';
import { hash2, hashString, Rng } from './rng';
import { derived, type GameState } from './state';

/**
 * What hides in the fog, the codex, relics, whispering stones, the Drowned Bell,
 * and what carries over from one cycle to the next.
 */

export type SiteKind = 'ruin' | 'journal' | 'relic' | 'stone' | 'bell';

export interface Site {
  id: number;
  kind: SiteKind;
  x: number;
  y: number;
  /** Set once light has reached it. */
  found: boolean;
  relic?: RelicId;
  /** Whispering stones: the player's answer. */
  choice?: 'accepted' | 'refused';
}

export type GameEventKind = 'find' | 'page' | 'relic' | 'stone' | 'bell' | 'whisper' | 'decipher' | 'goal';

/** Something the HUD should tell the player about. Transient: drained by the HUD. */
export interface GameEvent {
  kind: GameEventKind;
  title: string;
  text: string;
  siteId?: number;
}

/** What survives the end of a cycle. */
export interface Legacy {
  cycle: number;
  relics: RelicId[];
  codex: Record<string, 'found' | 'read'>;
  /** Names of everyone the fog has taken in earlier cycles. */
  echoes: string[];
}

export const FIRST_LEGACY: Legacy = { cycle: 1, relics: [], codex: {}, echoes: [] };

const MAX_EVENTS = 30;
const MAX_ECHOES = 60;

export function emit(state: GameState, e: GameEvent): void {
  state.events.push(e);
  if (state.events.length > MAX_EVENTS) state.events.shift();
}

export function hasRelic(state: GameState, id: RelicId): boolean {
  return state.relics.includes(id);
}

/** Production speed multiplier from relics and stone pacts. */
export function productionMultiplier(state: GameState): number {
  return (1 + BALANCE.pactProduction * state.pacts) * (hasRelic(state, 'compass') ? 1.1 : 1);
}

export function pageText(state: GameState, page: LorePage): string {
  return page.text.replaceAll('{bellDir}', state.bellDir);
}

// ---------------------------------------------------------------------------
// Placing sites when the map is made

/** Scatter ruins, journals, relics, stones and the bell across land you can reach from the landing. */
export function placeSites(state: GameState, origin: { x: number; y: number }): void {
  const { map } = state;
  const W = map.width;
  const rng = new Rng(hashString(state.seed + ':sites'));

  // Walking distance over land from the landing.
  const dist = new Int32Array(W * map.height).fill(-1);
  const queue = [origin.y * W + origin.x];
  dist[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      const j = ny * W + nx;
      if (dist[j] >= 0 || map.terrain[j] === Terrain.Water) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }

  const occ = derived(state).occ;
  const candidates: { x: number; y: number; d: number; coast: boolean }[] = [];
  let maxD = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 0 || occ[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    // Keep the starting light clear: secrets are for the fog.
    if (Math.hypot(x + 0.5 - origin.x, y + 0.5 - origin.y) < BALANCE.siteMinDistance) continue;
    candidates.push({ x, y, d: dist[i], coast: map.terrain[i] === Terrain.Coast });
    maxD = Math.max(maxD, dist[i]);
  }
  if (!candidates.length) return;

  const taken: { x: number; y: number }[] = [];
  const spaced = (c: { x: number; y: number }) => taken.every((t) => Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) >= 4);
  const add = (kind: SiteKind, c: { x: number; y: number }, extra: Partial<Site> = {}) => {
    taken.push(c);
    state.sites.push({ id: state.sites.length + 1, kind, x: c.x, y: c.y, found: false, ...extra });
  };
  /** A random spaced candidate whose walking distance is in [lo, hi], widening the band if needed. */
  const pick = (lo: number, hi: number) => {
    for (let widen = 0; widen < 6; widen++) {
      const pool = candidates.filter((c) => c.d >= lo - widen * 4 && c.d <= hi + widen * 4 && spaced(c));
      if (pool.length) return rng.pick(pool);
    }
    return null;
  };

  // The Drowned Bell waits on the coast furthest from the landing.
  const coast = candidates.filter((c) => c.coast);
  const bell = (coast.length ? coast : candidates).reduce((a, b) => (b.d > a.d ? b : a));
  add('bell', bell);
  state.bellDir = compassDirection(origin, bell);

  // An early ruin and journal just past the starting light, to show that the fog hides things.
  const early = Math.min(16, maxD);
  for (const kind of ['ruin', 'journal'] as const) {
    const c = pick(early - 6, early);
    if (c) add(kind, c);
  }
  // The rest of the journals form a trail outward toward the bell.
  for (let i = 1; i < BALANCE.journalSites; i++) {
    const centre = early + (i / BALANCE.journalSites) * (maxD - early);
    const c = pick(centre - 4, centre + 4);
    if (c) add('journal', c);
  }
  for (let i = 0; i < BALANCE.ruinSites - 1; i++) {
    const c = pick(early, maxD * 0.9);
    if (c) add('ruin', c);
  }
  for (let i = 0; i < BALANCE.stoneSites; i++) {
    const c = pick(maxD * 0.3, maxD * 0.7);
    if (c) add('stone', c);
  }
  const unowned = RELIC_IDS.filter((r) => !state.relics.includes(r));
  for (let i = 0; i < BALANCE.relicSites && unowned.length; i++) {
    const relic = unowned.splice(Math.floor(rng.next() * unowned.length), 1)[0];
    const c = pick(maxD * 0.35, maxD);
    if (c) add('relic', c, { relic });
  }
  state.rev++;
}

function compassDirection(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const angle = Math.atan2(-(to.y - from.y), to.x - from.x); // y grows south
  const names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  return names[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

// ---------------------------------------------------------------------------
// Each step

export function updateSites(state: GameState, dt: number): void {
  for (const site of state.sites) {
    if (site.found || !isLit(state, site.x, site.y)) continue;
    site.found = true;
    state.rev++;
    discover(state, site);
  }
  updateDecipher(state, dt);
  updateWhispers(state, dt);
}

function discover(state: GameState, site: Site): void {
  switch (site.kind) {
    case 'ruin': {
      const loot = ruinLoot(state, site);
      const cap = derived(state).storageCap;
      for (const [g, n] of Object.entries(loot.goods) as [GoodId, number][]) state.goods[g] = Math.min(cap, state.goods[g] + n);
      state.coins += loot.coins;
      const parts = [`${loot.coins} coins`, ...Object.entries(loot.goods).map(([g, n]) => `${n} ${g}`)];
      emit(state, { kind: 'find', title: 'Ruins in the fog', text: `You salvage ${parts.join(', ')}.`, siteId: site.id });
      break;
    }
    case 'journal': {
      const page = PAGES.find((p) => !state.codex[p.id]);
      if (page) {
        state.codex[page.id] = page.encrypted ? 'found' : 'read';
        emit(state, {
          kind: 'page',
          title: page.encrypted ? 'A page in cipher' : page.title,
          text: page.encrypted ? 'You cannot read it. An Archive could.' : 'Added to your codex.',
          siteId: site.id,
        });
      } else {
        // Nothing left to learn from the Company here. Something else wrote this one.
        emit(state, { kind: 'whisper', title: 'A page, damp and new', text: whisperLine(state, site.id), siteId: site.id });
      }
      break;
    }
    case 'relic': {
      if (site.relic && !state.relics.includes(site.relic)) state.relics.push(site.relic);
      const r = site.relic ? RELICS[site.relic] : null;
      if (r) emit(state, { kind: 'relic', title: r.name, text: `${r.effect} You will keep it, whatever happens.`, siteId: site.id });
      break;
    }
    case 'stone':
      emit(state, { kind: 'stone', title: 'A whispering stone', text: 'It is speaking. Click it to listen.', siteId: site.id });
      break;
    case 'bell':
      emit(state, { kind: 'bell', title: 'The Drowned Bell', text: 'It hangs in the ruin of a chapel, half in the sea.', siteId: site.id });
      break;
  }
}

export function ruinLoot(state: GameState, site: Site): { coins: number; goods: Partial<Record<GoodId, number>> } {
  const r = (k: number) => hash2(site.id, k, hashString(state.seed));
  const goods: Partial<Record<GoodId, number>> = {
    wood: 8 + Math.floor(r(1) * 9),
    planks: 4 + Math.floor(r(2) * 5),
  };
  if (r(3) > 0.4) goods.stone = 2 + Math.floor(r(4) * 5);
  return { coins: 60 + Math.floor(r(5) * 100), goods };
}

/** Archives slowly decipher encrypted pages, one at a time. */
function updateDecipher(state: GameState, dt: number): void {
  const pending = PAGES.find((p) => state.codex[p.id] === 'found');
  const archives = state.buildings.filter((b) => b.type === 'archive' && b.status === 'working').length;
  if (!pending || !archives) return;
  state.decipher += (dt * archives) / BALANCE.decipherTime;
  if (state.decipher < 1) return;
  state.decipher = 0;
  state.codex[pending.id] = 'read';
  emit(state, { kind: 'decipher', title: `Deciphered: ${pending.title}`, text: 'The Archive has read it. See your codex.' });
}

/** Names the fog can speak with: your own lost first, then the Company. */
function voices(state: GameState): string[] {
  const own = [...state.lostNames, ...state.echoes];
  return own.length ? own : COMPANY_NAMES;
}

export function whisperLine(state: GameState, salt: number): string {
  const names = voices(state);
  const h = (k: number) => hash2(Math.floor(state.time), salt + k, hashString(state.seed));
  const name = names[Math.floor(h(1) * names.length)];
  return WHISPERS[Math.floor(h(2) * WHISPERS.length)].replaceAll('{name}', name);
}

function updateWhispers(state: GameState, dt: number): void {
  if (state.tolling.phase !== 'surge') {
    state.whisperTimer = BALANCE.firstWhisper;
    return;
  }
  state.whisperTimer -= dt;
  if (state.whisperTimer > 0) return;
  state.whisperTimer = BALANCE.whisperInterval;
  emit(state, { kind: 'whisper', title: '', text: whisperLine(state, state.tolling.count * 31 + Math.floor(state.time)) });
}

/** Give names to residents as they walk into the fog, so it can speak with their voices. */
export function nameTheLost(state: GameState, count: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const h = hash2(state.lost + i, state.cycle, hashString(state.seed + ':names'));
    names.push(RESIDENT_NAMES[Math.floor(h * RESIDENT_NAMES.length)]);
  }
  state.lostNames.push(...names);
  return names;
}

// ---------------------------------------------------------------------------
// Player choices

/** What the player sees a site as. Undiscovered ones stay a mystery, except the bell. */
export function siteName(site: Site): string {
  if (!site.found && site.kind !== 'bell') return 'Something in the fog';
  switch (site.kind) {
    case 'ruin':
      return 'Salvaged ruins';
    case 'journal':
      return 'An empty satchel';
    case 'relic':
      return site.relic ? RELICS[site.relic].name : 'A relic';
    case 'stone':
      return 'A whispering stone';
    case 'bell':
      return 'The Drowned Bell';
  }
}

export function siteAt(state: GameState, x: number, y: number): Site | undefined {
  return state.sites.find((s) => s.x === x && s.y === y);
}

/** Does this site stop you building on its tile? */
export function siteBlocks(site: Site): boolean {
  return !site.found || site.kind === 'stone' || site.kind === 'bell';
}

/** Answer a whispering stone. Accepting speeds up all production, but dread rises everywhere. */
export function answerStone(state: GameState, siteId: number, accept: boolean): boolean {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site || site.kind !== 'stone' || !site.found || site.choice) return false;
  site.choice = accept ? 'accepted' : 'refused';
  if (accept) state.pacts++;
  state.rev++;
  return true;
}

/** Why the bell can't be rung yet, or null if it can. */
export function bellBlocker(state: GameState): string | null {
  const bell = state.sites.find((s) => s.kind === 'bell');
  if (!bell || !bell.found) return 'You have not found the bell.';
  if (!isLit(state, bell.x, bell.y)) return 'Bring light to the drowned shore first.';
  if (state.codex[BELL_PAGE] !== 'read') {
    return state.codex[BELL_PAGE] === 'found'
      ? 'The way to ring it is in a page of cipher. An Archive can read it.'
      : 'You do not know how to ring it. Keep following the journals.';
  }
  return null;
}

export function ringBell(state: GameState): boolean {
  if (bellBlocker(state) !== null || state.bellRung) return false;
  state.bellRung = true;
  return true;
}

/** What the next cycle inherits. */
export function nextLegacy(state: GameState): Legacy {
  return {
    cycle: state.cycle + 1,
    relics: [...state.relics],
    codex: { ...state.codex },
    echoes: [...state.echoes, ...state.lostNames].slice(-MAX_ECHOES),
  };
}

/** Codex completion: pages read out of all pages. */
export function codexProgress(state: GameState): { read: number; found: number; total: number } {
  const values = Object.values(state.codex);
  return { read: values.filter((v) => v === 'read').length, found: values.length, total: PAGES.length };
}

