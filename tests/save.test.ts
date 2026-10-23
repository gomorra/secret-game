import { describe, expect, it } from 'vitest';
import { lPath, placeBuilding } from '../src/sim/build';
import { litGrid } from '../src/sim/fog';
import { deserialize, exportString, rleDecode, rleEncode, SaveError, SAVE_VERSION, serialize } from '../src/sim/save';
import { createGame, derived, type GameState } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import type { BuildingId } from '../src/data/buildings';
import { testState } from './helpers';

function place(s: GameState, type: BuildingId, x: number, y: number) {
  const r = placeBuilding(s, type, x, y);
  if (!r.ok) throw new Error(`${type} at ${x},${y}: ${r.reason}`);
  return r.building;
}

/** A small working colony: road, houses, a sawmill and a fishery-free food supply. */
function colony(): GameState {
  const s = testState();
  for (const [x, y] of lPath(2, 4, 19, 4)) place(s, 'road', x, y);
  place(s, 'house', 4, 5);
  place(s, 'house', 7, 5);
  place(s, 'sawmill', 10, 5);
  place(s, 'shrine', 13, 5);
  s.goods.fish = 40;
  advance(s, 90);
  return s;
}

const FIXED_TIME = 1_700_000_000_000;

describe('run-length encoding', () => {
  it('round-trips', () => {
    const data = [0, 0, 0, 1, 2, 2, 6, 6, 6, 6, 0];
    expect(rleDecode(rleEncode(data), data.length)).toEqual(data);
    expect(rleEncode([])).toEqual([]);
  });

  it('rejects data of the wrong length', () => {
    expect(() => rleDecode([1, 5], 4)).toThrow(SaveError);
    expect(() => rleDecode([1, 3], 4)).toThrow(SaveError);
    expect(() => rleDecode('nope', 4)).toThrow(SaveError);
  });
});

describe('save and load', () => {
  it('round-trips a working colony exactly', () => {
    const s = colony();
    const text = serialize(s, FIXED_TIME);
    const loaded = deserialize(text);
    expect(serialize(loaded, FIXED_TIME)).toBe(text);
    expect(loaded.buildings).toEqual(s.buildings);
    expect(loaded.goods).toEqual(s.goods);
    expect(loaded.coins).toBe(s.coins);
  });

  it('carries on exactly as if it had never been saved', () => {
    const s = colony();
    const loaded = deserialize(serialize(s));
    advance(s, 60);
    advance(loaded, 60);
    expect(serialize(loaded, FIXED_TIME)).toBe(serialize(s, FIXED_TIME));
  });

  it('round-trips a generated island with its fog, secrets and codex', () => {
    const s = createGame('save-me');
    s.codex['log-3'] = 'read';
    s.relics.push('ember');
    s.lostNames.push('Pell');
    s.goals.push('road');
    s.tolling.phase = 'warning';
    advance(s, 30);
    const loaded = deserialize(serialize(s));
    expect(loaded.map.terrain).toEqual(s.map.terrain);
    expect(loaded.explored).toEqual(s.explored);
    expect(loaded.sites).toEqual(s.sites);
    expect(loaded.codex).toEqual(s.codex);
    expect(loaded.relics).toEqual(['ember']);
    expect(loaded.lostNames).toEqual(['Pell']);
    expect(loaded.goals).toEqual(s.goals);
    expect(loaded.goals).toContain('road');
    expect(loaded.tolling).toEqual(s.tolling);
    expect(Array.from(litGrid(loaded))).toEqual(Array.from(litGrid(s)));
    expect(derived(loaded).connected).toEqual(derived(s).connected);
  });

  it('leaves out transient events and fx', () => {
    const s = colony();
    s.events.push({ kind: 'find', title: 'x', text: 'y' });
    expect(s.fx.length).toBeGreaterThan(0);
    const data = JSON.parse(serialize(s));
    expect(data.fogbound).toBe(SAVE_VERSION);
    expect(data.state.events).toBeUndefined();
    expect(data.state.fx).toBeUndefined();
    const loaded = deserialize(serialize(s));
    expect(loaded.events).toEqual([]);
    expect(loaded.fx).toEqual([]);
  });

  it('keeps a full island save small', () => {
    const s = createGame('small');
    expect(serialize(s).length).toBeLessThan(20_000);
  });

  it('exports and imports as one line of text', () => {
    const s = colony();
    s.lostNames.push('Søren Æsk'); // non-ASCII survives the base64 trip
    const text = exportString(s);
    expect(text).toMatch(/^FOGBOUND1:[A-Za-z0-9+/=]+$/);
    const loaded = deserialize(text);
    expect(loaded.lostNames).toEqual(['Søren Æsk']);
    expect(serialize(loaded, FIXED_TIME)).toBe(serialize(s, FIXED_TIME));
    // Pasted with line breaks and spaces still works.
    expect(deserialize(`  ${text.slice(0, 40)}\n${text.slice(40)}  `).coins).toBe(s.coins);
    // Plain JSON imports too.
    expect(deserialize(serialize(s)).coins).toBe(s.coins);
  });

  it('refuses things that are not saves', () => {
    expect(() => deserialize('hello')).toThrow(SaveError);
    expect(() => deserialize('{"a":1}')).toThrow(SaveError);
    expect(() => deserialize('FOGBOUND1:%%%')).toThrow(SaveError);
    const future = JSON.parse(serialize(colony()));
    future.fogbound = SAVE_VERSION + 1;
    expect(() => deserialize(JSON.stringify(future))).toThrow(/newer version/);
  });

  it('drops damaged parts but keeps the rest', () => {
    const data = JSON.parse(serialize(colony()));
    data.state.buildings.push({ id: 999, type: 'castle', x: 1, y: 1 }, { id: 1000, type: 'house', x: -4, y: 1 });
    data.state.goods.fish = 'lots';
    data.state.relics.push('nonsense');
    delete data.state.goals;
    const loaded = deserialize(JSON.stringify(data));
    expect(loaded.buildings.some((b) => b.id >= 999)).toBe(false);
    expect(loaded.goods.fish).toBe(0);
    expect(loaded.relics).toEqual([]);
    expect(loaded.goals).toEqual([]);
    expect(loaded.nextId).toBeGreaterThan(Math.max(...loaded.buildings.map((b) => b.id)));
  });

  it('refuses a save without a warehouse', () => {
    const data = JSON.parse(serialize(colony()));
    data.state.buildings = data.state.buildings.filter((b: { type: string }) => b.type !== 'warehouse');
    expect(() => deserialize(JSON.stringify(data))).toThrow(/warehouse/);
  });
});
