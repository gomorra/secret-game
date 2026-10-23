import { BUILDINGS } from '../data/buildings';
import type { GoodId } from '../data/goods';
import { tierDef } from '../data/tiers';
import { derived, type GameState } from './state';

/** Run production buildings for one step. */
export function updateProduction(state: GameState, dt: number): void {
  const d = derived(state);
  const cap = d.storageCap;
  for (const b of state.buildings) {
    const prod = BUILDINGS[b.type].production;
    if (!prod) continue;
    if (!d.connected.has(b.id)) {
      b.status = 'unconnected';
      continue;
    }
    const eff = d.efficiency.get(b.id) ?? 1;
    if (eff <= 0) {
      b.status = 'noResource';
      continue;
    }
    if (!b.active) {
      // Don't take inputs if there's nowhere to put the output.
      if (state.goods[prod.output] + prod.amount > cap) {
        b.status = 'storageFull';
        continue;
      }
      const inputs = Object.entries(prod.inputs) as [GoodId, number][];
      if (inputs.some(([g, n]) => state.goods[g] < n)) {
        b.status = 'noInput';
        continue;
      }
      for (const [g, n] of inputs) state.goods[g] -= n;
      b.active = true;
      b.progress = 0;
    }
    b.progress = (b.progress ?? 0) + (dt * eff) / prod.cycle;
    b.status = 'working';
    if (b.progress >= 1) {
      if (state.goods[prod.output] + prod.amount > cap) {
        b.progress = 1;
        b.status = 'storageFull';
        continue;
      }
      state.goods[prod.output] += prod.amount;
      b.active = false;
      b.progress = 0;
    }
  }
}

/** Coins per minute spent on upkeep. */
export function upkeepPerMinute(state: GameState): number {
  let n = 0;
  for (const b of state.buildings) n += BUILDINGS[b.type].upkeep;
  return n;
}

/** Coins per minute currently earned from taxes. */
export function taxPerMinute(state: GameState): number {
  let n = 0;
  for (const b of state.buildings) {
    if (b.type !== 'house' || b.status !== 'ok') continue;
    n += (b.residents ?? 0) * tierDef(b.tier ?? 1).tax;
  }
  return n;
}

/** Pay upkeep and collect taxes for one step. Call after the population update. */
export function updateEconomy(state: GameState, dt: number): void {
  state.coins += ((taxPerMinute(state) - upkeepPerMinute(state)) * dt) / 60;
}
