import { BALANCE } from '../data/balance';
import { tierDef } from '../data/tiers';
import { derived, type Building, type GameState } from './state';

/** Houses consume their needs, grow, and decide whether they pay tax. */
export function updateHouses(state: GameState, dt: number): void {
  const d = derived(state);
  const k = Math.min(1, dt / BALANCE.needSmoothing);

  for (const b of state.buildings) {
    if (b.type !== 'house') continue;
    const tier = tierDef(b.tier ?? 1);
    const residents = b.residents ?? 0;
    const connected = d.connected.has(b.id);
    const supply = (b.supply ??= {});

    for (const need of tier.needs) {
      let ratio = 0;
      if (connected) {
        const want = (residents * need.rate * dt) / 60;
        const take = Math.min(state.goods[need.good], want);
        state.goods[need.good] -= take;
        ratio = want > 0 ? take / want : 1;
      }
      const prev = supply[need.good] ?? 1;
      supply[need.good] = prev + (ratio - prev) * k;
    }

    const met = needsMet(b);
    b.status = !connected ? 'unconnected' : met ? 'ok' : 'needsUnmet';

    if (!connected) continue;
    b.growth = (b.growth ?? 0) + dt;
    if (b.growth >= BALANCE.houseGrowthInterval) {
      b.growth = 0;
      if (residents < tier.maxResidents && (met || residents < BALANCE.houseStarterResidents)) {
        b.residents = residents + 1;
      }
    }
  }
}

export function needsMet(b: Building): boolean {
  const tier = tierDef(b.tier ?? 1);
  return tier.needs.every((n) => (b.supply?.[n.good] ?? 1) >= BALANCE.needMetThreshold);
}
