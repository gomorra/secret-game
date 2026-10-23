import { BUILDINGS, type BuildingId } from '../data/buildings';
import { GOOD_IDS, type GoodId } from '../data/goods';
import { RELIC_IDS, type RelicId } from '../data/relics';
import { MAX_TIER } from '../data/tiers';
import { refreshLight } from './fog';
import type { Site, SiteKind } from './lore';
import type { Terrain } from './map';
import type { Building, BuildingStatus, GameState, TollingPhase } from './state';

/**
 * Saving and loading a colony as versioned JSON.
 * Transient fields (`events`, `fx`) and derived caches are left out; terrain and the
 * explored grid are run-length encoded so a save stays small enough to copy and paste.
 *
 * Bump SAVE_VERSION when the format changes, and add a migration from the old version.
 */
export const SAVE_VERSION = 1;

/** Prefix of the copy-and-paste export string. */
const EXPORT_PREFIX = 'FOGBOUND1:';

export class SaveError extends Error {}

/** Upgrades a save of version n (the key) to version n + 1. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

interface SaveFile {
  fogbound: number;
  savedAt: number;
  state: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Run-length encoding: [value, count, value, count, ...]

export function rleEncode(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; ) {
    const v = values[i];
    let n = 1;
    while (i + n < values.length && values[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

export function rleDecode(runs: unknown, length: number): number[] {
  if (!Array.isArray(runs) || runs.length % 2) throw new SaveError('The map data is damaged.');
  const out: number[] = [];
  for (let i = 0; i < runs.length; i += 2) {
    const v = runs[i];
    const n = runs[i + 1];
    if (typeof v !== 'number' || !Number.isInteger(n) || n < 1 || out.length + n > length) {
      throw new SaveError('The map data is damaged.');
    }
    for (let k = 0; k < n; k++) out.push(v);
  }
  if (out.length !== length) throw new SaveError('The map data is damaged.');
  return out;
}

// ---------------------------------------------------------------------------
// Writing

export function serialize(state: GameState, savedAt = Date.now()): string {
  // Copy everything, then drop what isn't worth keeping and pack the big grids.
  const { events: _events, fx: _fx, map, explored, ...rest } = state;
  const file: SaveFile = {
    fogbound: SAVE_VERSION,
    savedAt,
    state: {
      ...rest,
      version: SAVE_VERSION,
      map: { width: map.width, height: map.height, rev: map.rev, terrain: rleEncode(map.terrain) },
      explored: rleEncode(explored),
    },
  };
  return JSON.stringify(file);
}

/** A save as one line of text, for export. */
export function exportString(state: GameState): string {
  return EXPORT_PREFIX + toBase64(serialize(state));
}

// ---------------------------------------------------------------------------
// Reading

/** Read a save written by `serialize` or `exportString`. Throws SaveError if it can't. */
export function deserialize(text: string): GameState {
  const trimmed = text.trim();
  let json = trimmed;
  if (trimmed.startsWith(EXPORT_PREFIX)) {
    try {
      json = fromBase64(trimmed.slice(EXPORT_PREFIX.length).replace(/\s+/g, ''));
    } catch {
      throw new SaveError('That save string is damaged.');
    }
  }
  let file: unknown;
  try {
    file = JSON.parse(json);
  } catch {
    throw new SaveError('That is not a Fogbound save.');
  }
  if (!isObject(file) || typeof file.fogbound !== 'number' || !isObject(file.state)) {
    throw new SaveError('That is not a Fogbound save.');
  }
  let version = file.fogbound;
  if (version > SAVE_VERSION) throw new SaveError('This save comes from a newer version of Fogbound.');
  let data = file.state;
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new SaveError('This save is too old to load.');
    data = migrate(data);
    version++;
  }
  return revive(data);
}

/** When a save was written (ms since epoch), or 0 if unknown. */
export function savedAt(text: string): number {
  try {
    const file = JSON.parse(text);
    return typeof file?.savedAt === 'number' ? file.savedAt : 0;
  } catch {
    return 0;
  }
}

function revive(d: Record<string, unknown>): GameState {
  const mapData = isObject(d.map) ? d.map : null;
  if (!mapData) throw new SaveError('The save has no map.');
  const width = int(mapData.width, 0);
  const height = int(mapData.height, 0);
  if (width < 4 || height < 4 || width > 1024 || height > 1024) throw new SaveError('The map data is damaged.');
  const size = width * height;
  const terrain = rleDecode(mapData.terrain, size);
  if (terrain.some((t) => !Number.isInteger(t) || t < 0 || t > 6)) throw new SaveError('The map data is damaged.');
  const explored = rleDecode(d.explored, size).map((v) => (v ? 1 : 0));

  const inMap = (x: unknown, y: unknown) => Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (y as number) >= 0 && (x as number) < width && (y as number) < height;

  const buildings: Building[] = [];
  for (const raw of arr(d.buildings)) {
    if (!isObject(raw) || typeof raw.type !== 'string' || !(raw.type in BUILDINGS)) continue;
    if (!Number.isInteger(raw.id) || !inMap(raw.x, raw.y)) continue;
    buildings.push({ ...(raw as unknown as Building), type: raw.type as BuildingId, status: (str(raw.status, 'ok') as BuildingStatus) });
  }
  if (!buildings.some((b) => b.type === 'warehouse')) throw new SaveError('The save has no warehouse.');
  const maxId = buildings.reduce((m, b) => Math.max(m, b.id), 0);

  const goodsData = isObject(d.goods) ? d.goods : {};
  const goods = Object.fromEntries(GOOD_IDS.map((g) => [g, Math.max(0, num(goodsData[g], 0))])) as Record<GoodId, number>;

  const t = isObject(d.tolling) ? d.tolling : {};
  const phase = (['calm', 'warning', 'surge'] as const).includes(t.phase as TollingPhase) ? (t.phase as TollingPhase) : 'calm';

  const sites: Site[] = [];
  for (const raw of arr(d.sites)) {
    if (!isObject(raw) || !inMap(raw.x, raw.y)) continue;
    if (!['ruin', 'journal', 'relic', 'stone', 'bell'].includes(raw.kind as string)) continue;
    sites.push({ ...(raw as unknown as Site), kind: raw.kind as SiteKind, found: !!raw.found });
  }

  const codexData = isObject(d.codex) ? d.codex : {};
  const codex: Record<string, 'found' | 'read'> = {};
  for (const [k, v] of Object.entries(codexData)) if (v === 'found' || v === 'read') codex[k] = v;

  const state: GameState = {
    version: 1,
    seed: str(d.seed, 'lost'),
    time: Math.max(0, num(d.time, 0)),
    map: { width, height, terrain: terrain as Terrain[], rev: int(mapData.rev, 0) },
    buildings,
    nextId: Math.max(int(d.nextId, 1), maxId + 1),
    coins: num(d.coins, 0),
    goods,
    unlockedTier: Math.max(1, Math.min(MAX_TIER, int(d.unlockedTier, 1))),
    explored,
    tolling: {
      phase,
      timer: num(t.timer, 60),
      strength: Math.max(0, Math.min(1, num(t.strength, 0))),
      count: Math.max(0, int(t.count, 0)),
    },
    doubleFuel: !!d.doubleFuel,
    lost: Math.max(0, int(d.lost, 0)),
    cycle: Math.max(1, int(d.cycle, 1)),
    sites,
    codex,
    relics: arr(d.relics).filter((r): r is RelicId => RELIC_IDS.includes(r as RelicId)),
    pacts: Math.max(0, int(d.pacts, 0)),
    lostNames: strings(d.lostNames),
    echoes: strings(d.echoes),
    decipher: Math.max(0, Math.min(1, num(d.decipher, 0))),
    whisperTimer: num(d.whisperTimer, 0),
    bellDir: str(d.bellDir, 'north'),
    bellRung: !!d.bellRung,
    goals: strings(d.goals),
    events: [],
    fx: [],
    rev: int(d.rev, 0),
  };
  if (d.alwaysLit) state.alwaysLit = true;
  refreshLight(state);
  return state;
}

// ---------------------------------------------------------------------------
// Small helpers

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function int(v: unknown, fallback: number): number {
  return Number.isInteger(v) ? (v as number) : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function strings(v: unknown): string[] {
  return arr(v).filter((s): s is string => typeof s === 'string');
}

/** UTF-8 safe base64. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
