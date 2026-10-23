import { BALANCE } from '../data/balance';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { GoodId } from '../data/goods';
import { tierDef } from '../data/tiers';
import { isLit } from './fog';
import { siteBlocks } from './lore';
import { inBounds, isBuildableTerrain, setTerrain, Terrain, terrainAt } from './map';
import { addBuilding, buildingAt, derived, footprint, resourceEfficiency, type Building, type GameState } from './state';

export type PlaceCheck = { ok: true; efficiency?: number } | { ok: false; reason: string; efficiency?: number };

export function canAfford(state: GameState, type: BuildingId): boolean {
  const { cost } = BUILDINGS[type];
  if (state.coins < cost.coins) return false;
  return Object.entries(cost.goods).every(([g, n]) => state.goods[g as GoodId] >= (n ?? 0));
}

/** Can a building of `type` go at (x, y) (top-left of its footprint)? */
export function canPlace(state: GameState, type: BuildingId, x: number, y: number): PlaceCheck {
  const def = BUILDINGS[type];
  if (!def.playerBuildable) return { ok: false, reason: 'This cannot be built.' };
  if (def.tier > state.unlockedTier) return { ok: false, reason: `Unlocks with ${tierDef(def.tier).name}.` };
  const [w, h] = def.size;
  const { map } = state;
  const occ = derived(state).occ;

  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inBounds(map, tx, ty)) return { ok: false, reason: 'Out of bounds.' };
      if (!isLit(state, tx, ty)) return { ok: false, reason: 'Too dark to build here. Bring light first.' };
      const t = terrainAt(map, tx, ty);
      if (!isBuildableTerrain(t)) {
        return { ok: false, reason: t === Terrain.Water ? 'Cannot build on water.' : 'The ground here is unbuildable.' };
      }
      if (occ[ty * map.width + tx]) return { ok: false, reason: 'Something is already here.' };
      const site = derived(state).siteTiles.get(ty * map.width + tx);
      if (site && siteBlocks(site)) return { ok: false, reason: 'Something in the fog stands here.' };
    }
  }

  let efficiency: number | undefined;
  if (def.resource) {
    efficiency = resourceEfficiency(state, occ, type, x, y);
    if (efficiency <= 0) return { ok: false, reason: `Needs ${def.resource.label} nearby.`, efficiency };
  }
  if (!canAfford(state, type)) return { ok: false, reason: 'Not enough resources.', efficiency };
  return { ok: true, efficiency };
}

/** Place a building, paying its cost. Forest under it is cleared. */
export function placeBuilding(
  state: GameState,
  type: BuildingId,
  x: number,
  y: number,
): { ok: true; building: Building } | { ok: false; reason: string } {
  const check = canPlace(state, type, x, y);
  if (!check.ok) return check;
  const def = BUILDINGS[type];
  state.coins -= def.cost.coins;
  for (const [g, n] of Object.entries(def.cost.goods)) state.goods[g as GoodId] -= n ?? 0;
  const [w, h] = def.size;
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (terrainAt(state.map, tx, ty) === Terrain.Forest) setTerrain(state.map, tx, ty, Terrain.Grass);
    }
  }
  return { ok: true, building: addBuilding(state, type, x, y) };
}

export function canDemolish(state: GameState, b: Building): { ok: true } | { ok: false; reason: string } {
  if (!BUILDINGS[b.type].playerBuildable) return { ok: false, reason: 'The Last Lantern cannot be removed.' };
  if (b.type === 'warehouse' && state.buildings.filter((o) => o.type === 'warehouse').length <= 1) {
    return { ok: false, reason: 'You need at least one warehouse.' };
  }
  return { ok: true };
}

/** Demolish whatever stands on (x, y). Refunds part of the material cost. */
export function demolishAt(state: GameState, x: number, y: number): { ok: true; building: Building } | { ok: false; reason: string } {
  const b = buildingAt(state, x, y);
  if (!b) return { ok: false, reason: 'Nothing to demolish.' };
  const check = canDemolish(state, b);
  if (!check.ok) return check;
  for (const [g, n] of Object.entries(BUILDINGS[b.type].cost.goods)) {
    state.goods[g as GoodId] += Math.floor((n ?? 0) * BALANCE.demolishRefund);
  }
  state.buildings.splice(state.buildings.indexOf(b), 1);
  state.rev++;
  return { ok: true, building: b };
}

/** Tiles along an L-shaped path from a to b (long leg first), as roads are dragged. Includes both ends. */
export function lPath(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const horizontalFirst = Math.abs(bx - ax) >= Math.abs(by - ay);
  const cx = horizontalFirst ? bx : ax;
  const cy = horizontalFirst ? ay : by;
  const out: [number, number][] = [];
  const walk = (x0: number, y0: number, x1: number, y1: number) => {
    const sx = Math.sign(x1 - x0);
    const sy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    for (;;) {
      if (!out.some(([px, py]) => px === x && py === y)) out.push([x, y]);
      if (x === x1 && y === y1) break;
      x += sx;
      y += sy;
    }
  };
  walk(ax, ay, cx, cy);
  walk(cx, cy, bx, by);
  return out;
}

export { footprint };
