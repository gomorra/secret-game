import { BALANCE } from '../data/balance';
import { GOODS, type GoodAmounts, type GoodId } from '../data/goods';
import { MAX_TIER, tierDef } from '../data/tiers';
import { BUILDINGS } from '../data/buildings';
import { derived, populationOfTier, type Building, type GameState } from './state';

/** Houses consume their needs, grow, upgrade, and decide whether they pay tax. */
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
    if (!connected) {
      b.content = 0;
      continue;
    }

    b.growth = (b.growth ?? 0) + dt;
    if (b.growth >= BALANCE.houseGrowthInterval) {
      b.growth = 0;
      if (residents < tier.maxResidents && (met || residents < BALANCE.houseStarterResidents)) {
        b.residents = residents + 1;
      }
    }

    if (upgradeBlocker(state, b) === null) {
      b.content = (b.content ?? 0) + dt;
      if (b.content >= BALANCE.upgradeDelay) upgrade(state, b);
    } else {
      b.content = 0;
    }
  }

  updateUnlocks(state);
}

function upgrade(state: GameState, b: Building): void {
  const next = tierDef((b.tier ?? 1) + 1);
  for (const [g, n] of Object.entries(next.upgradeCost)) state.goods[g as GoodId] -= n ?? 0;
  b.tier = next.id;
  b.content = 0;
  // New needs start out satisfied, so the house gets a moment to settle in.
  b.supply = {};
}

/** Unlock the next tier once enough people live in the current top tier. */
function updateUnlocks(state: GameState): void {
  while (state.unlockedTier < MAX_TIER) {
    const next = tierDef(state.unlockedTier + 1);
    if (populationOfTier(state, state.unlockedTier) < next.unlockResidents) break;
    state.unlockedTier++;
  }
}

export function needsMet(b: Building): boolean {
  const tier = tierDef(b.tier ?? 1);
  return tier.needs.every((n) => (b.supply?.[n.good] ?? 1) >= BALANCE.needMetThreshold);
}

function goodsList(amounts: GoodAmounts): string {
  return Object.entries(amounts)
    .map(([g, n]) => `${n} ${GOODS[g as GoodId].name.toLowerCase()}`)
    .join(', ');
}

/**
 * Why this house can't upgrade right now, or null if it can.
 * A house upgrades once it has been upgradable for `BALANCE.upgradeDelay` seconds.
 */
export function upgradeBlocker(state: GameState, b: Building): string | null {
  const tierId = b.tier ?? 1;
  if (tierId >= MAX_TIER) return 'Already the highest tier.';
  const tier = tierDef(tierId);
  const next = tierDef(tierId + 1);
  if (state.unlockedTier <= tierId) return `${next.name} unlock at ${next.unlockResidents} ${tier.name}.`;
  if (!derived(state).connected.has(b.id)) return 'Needs a road to a warehouse.';
  if ((b.residents ?? 0) < tier.maxResidents) return 'The house must be full.';
  if (!needsMet(b)) return `${tier.name} needs must be met.`;
  // Don't move people up into a tier whose goods you can't supply yet.
  const missing = next.needs.filter((n) => state.goods[n.good] < 1).map((n) => GOODS[n.good].name.toLowerCase());
  if (missing.length) return `Waiting for ${missing.join(' and ')} in the warehouse.`;
  const cost = Object.entries(next.upgradeCost) as [GoodId, number][];
  if (cost.some(([g, n]) => state.goods[g] < n)) return `Upgrading costs ${goodsList(next.upgradeCost)}.`;
  return null;
}

/** Does the house get its tier's luxury bonus? */
export function hasLuxury(state: GameState, b: Building): boolean {
  const luxury = tierDef(b.tier ?? 1).luxury;
  return derived(state).services.get(b.id)?.has(luxury) ?? false;
}

/** Coins per minute this house pays right now. */
export function houseTax(state: GameState, b: Building): number {
  if (b.type !== 'house' || b.status !== 'ok') return 0;
  const base = (b.residents ?? 0) * tierDef(b.tier ?? 1).tax;
  return hasLuxury(state, b) ? base * (1 + BALANCE.luxuryTaxBonus) : base;
}

/** Name of a building, used in messages. */
export function buildingName(b: Building): string {
  return b.type === 'house' ? `${tierDef(b.tier ?? 1).single} house` : BUILDINGS[b.type].name;
}
