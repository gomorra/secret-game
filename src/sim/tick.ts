import { BALANCE } from '../data/balance';
import { updateEconomy, updateProduction, updateServices } from './economy';
import { updateLights, updateTolling } from './fog';
import { updateSites } from './lore';
import { updateHouses } from './population';
import type { GameState } from './state';

/** Advance the simulation by one fixed step. */
export function step(state: GameState): void {
  const dt = BALANCE.tick;
  state.time += dt;
  updateTolling(state, dt);
  updateLights(state, dt);
  updateSites(state, dt);
  updateProduction(state, dt);
  updateServices(state);
  updateHouses(state, dt);
  updateEconomy(state, dt);
}

/** Advance by `seconds` of game time (rounded down to whole steps). */
export function advance(state: GameState, seconds: number): void {
  const steps = Math.floor(seconds / BALANCE.tick + 1e-9);
  for (let i = 0; i < steps; i++) step(state);
}
