import { BALANCE } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { hasRelic } from './lore';
import { centre, derived, footprint, type Building, type GameState } from './state';

/**
 * Light and fog. Each tile is dark, explored (seen once) or lit (buildable, buildings work).
 * Lit tiles are recomputed every step from the lights' current radii; explored tiles are saved.
 */

const litCache = new WeakMap<GameState, Uint8Array>();

/** Current lit radius of a light, after fuel, fading and any surge. */
export function lightRadius(state: GameState, b: Building): number {
  const light = BUILDINGS[b.type].light;
  if (!light) return 0;
  const shielded = !!light.fuel && state.doubleFuel && !!b.fueled;
  const base = hasRelic(state, 'chime') ? BALANCE.surgeShrinkChime : BALANCE.surgeShrink;
  const shrink = shielded ? 0 : Math.min(0.9, base * (light.hunger ?? 1)) * state.tolling.strength;
  const radius = light.radius + (hasRelic(state, 'ember') ? 1 : 0);
  return radius * (b.intensity ?? 0) * (1 - shrink);
}

/** 1 for lit tiles. */
export function litGrid(state: GameState): Uint8Array {
  return litCache.get(state) ?? refreshLight(state);
}

export function isLit(state: GameState, x: number, y: number): boolean {
  const { width: W, height: H } = state.map;
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  return litGrid(state)[y * W + x] === 1;
}

/** A building counts as lit if any tile of it is. */
export function isBuildingLit(state: GameState, b: Building): boolean {
  const f = footprint(b);
  for (let y = f.y; y < f.y + f.h; y++) {
    for (let x = f.x; x < f.x + f.w; x++) if (isLit(state, x, y)) return true;
  }
  return false;
}

/** Recompute lit tiles from current light radii, and mark everything in sight as explored. */
export function refreshLight(state: GameState): Uint8Array {
  const { width: W, height: H } = state.map;
  const lit = new Uint8Array(W * H);
  if (state.alwaysLit) {
    lit.fill(1);
    state.explored.fill(1);
  } else {
    for (const b of state.buildings) {
      const light = BUILDINGS[b.type].light;
      if (!light) continue;
      const r = lightRadius(state, b);
      if (r <= 0.3) continue;
      const c = centre(b);
      stamp(W, H, c.x, c.y, r, (i) => (lit[i] = 1));
      stamp(W, H, c.x, c.y, r * (light.reveal ?? 1) + BALANCE.revealMargin, (i) => (state.explored[i] = 1));
    }
  }
  litCache.set(state, lit);
  return lit;
}

/** Call fn for every tile whose centre lies within r of (cx, cy). */
function stamp(W: number, H: number, cx: number, cy: number, r: number, fn: (i: number) => void): void {
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) fn(y * W + x);
    }
  }
}

/** Burn fuel, let lights bloom or fade, and recompute which tiles are lit. */
export function updateLights(state: GameState, dt: number): void {
  const d = derived(state);
  const surging = state.tolling.phase === 'surge';
  for (const b of state.buildings) {
    const light = BUILDINGS[b.type].light;
    if (!light) continue;
    if (!light.fuel) {
      b.intensity = 1;
      b.fueled = true;
      b.status = 'working';
      continue;
    }
    let fueled = false;
    if (d.connected.has(b.id)) {
      const thrift = hasRelic(state, 'wick') ? 0.75 : 1;
      const want = (light.burn * thrift * (surging && state.doubleFuel ? 2 : 1) * dt) / 60;
      const have = state.goods[light.fuel];
      state.goods[light.fuel] = Math.max(0, have - want);
      fueled = have >= want;
    }
    b.fueled = fueled;
    b.status = !d.connected.has(b.id) ? 'unconnected' : fueled ? 'working' : 'noFuel';
    const i = b.intensity ?? 0;
    b.intensity = fueled ? Math.min(1, i + dt / BALANCE.lightRiseTime) : Math.max(0, i - dt / BALANCE.lightFadeTime);
  }
  refreshLight(state);
}

/** Advance the Tolling: calm → warning (the bell) → surge → calm. */
export function updateTolling(state: GameState, dt: number): void {
  const t = state.tolling;
  t.timer -= dt;
  if (t.timer <= 0) {
    if (t.phase === 'calm') {
      t.phase = 'warning';
      t.timer += BALANCE.tollingWarning;
    } else if (t.phase === 'warning') {
      t.phase = 'surge';
      t.timer += BALANCE.tollingSurge;
      t.count++;
    } else {
      t.phase = 'calm';
      t.timer += BALANCE.tollingCalm;
    }
  }
  const target = t.phase === 'surge' ? 1 : 0;
  const stepSize = dt / BALANCE.surgeRamp;
  t.strength = target > t.strength ? Math.min(target, t.strength + stepSize) : Math.max(target, t.strength - stepSize);
}
