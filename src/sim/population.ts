import { BALANCE } from '../data/balance';
import { GOODS, type GoodAmounts, type GoodId } from '../data/goods';
import { MAX_TIER, tierDef } from '../data/tiers';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { isBuildingLit } from './fog';
import { hasRelic, nameTheLost } from './lore';
import { derived, populationOfTier, pushFx, type Building, type GameState } from './state';

/** Houses consume their needs, feel dread, grow, upgrade, and decide whether they pay tax. */
export function updateHouses(state: GameState, dt: number): void {
  const d = derived(state);
  const k = Math.min(1, dt / BALANCE.needSmoothing);

  for (const b of state.buildings) {
    if (b.type !== 'house') continue;
    const tier = tierDef(b.tier ?? 1);
    const residents = b.residents ?? 0;
    const connected = d.connected.has(b.id);
    const lit = isBuildingLit(state, b);
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

    updateDread(state, b, dt, lit, met);
    if ((b.emptyFor ?? 0) > 0) b.emptyFor = Math.max(0, (b.emptyFor ?? 0) - dt);

    b.status = !connected
      ? 'unconnected'
      : (b.emptyFor ?? 0) > 0
        ? 'abandoned'
        : !lit
          ? 'dark'
          : met
            ? 'ok'
            : 'needsUnmet';
    if (!connected) {
      b.content = 0;
      continue;
    }

    b.growth = (b.growth ?? 0) + dt;
    if (b.growth >= BALANCE.houseGrowthInterval) {
      b.growth = 0;
      const calm = lit && (b.dread ?? 0) < BALANCE.dreadNoGrowth && (b.emptyFor ?? 0) <= 0;
      if (calm && (b.residents ?? 0) < tier.maxResidents && (met || (b.residents ?? 0) < BALANCE.houseStarterResidents)) {
        b.residents = (b.residents ?? 0) + 1;
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

/** Dread change per minute for a house right now. */
export function dreadRate(state: GameState, b: Building, lit = isBuildingLit(state, b), met = needsMet(b)): number {
  let rate = 0;
  if (!lit) rate += BALANCE.dreadUnlit;
  if (!met) rate += BALANCE.dreadNeedsUnmet;
  if (state.tolling.phase === 'surge') rate += BALANCE.dreadSurge;
  if (servedBy(state, b, 'shrine')) rate += BALANCE.dreadShrine;
  if (lit && met) rate += BALANCE.dreadContent;
  rate += BALANCE.pactDread * state.pacts;
  // The Mourning Veil slows fear, but doesn't speed up calm.
  if (rate > 0 && hasRelic(state, 'veil')) rate *= 0.75;
  return rate;
}

function updateDread(state: GameState, b: Building, dt: number, lit: boolean, met: boolean): void {
  const residents = b.residents ?? 0;
  b.dread = Math.max(0, Math.min(100, (b.dread ?? 0) + (dreadRate(state, b, lit, met) * dt) / 60));
  if (b.dread >= 100 && residents > 0) {
    // They open the door and walk into the fog.
    nameTheLost(state, residents);
    pushFx(state, { kind: 'lost', id: b.id, count: residents });
    state.lost += residents;
    b.residents = 0;
    b.dread = BALANCE.dreadAfterLoss;
    b.emptyFor = BALANCE.abandonTime;
    b.content = 0;
  }
}

/** Is the house reached by a connected, lit service building of this type? */
export function servedBy(state: GameState, house: Building, type: BuildingId): boolean {
  const d = derived(state);
  return (d.services.get(house.id) ?? []).some((id) => {
    const p = d.byId.get(id);
    return p?.type === type && isBuildingLit(state, p);
  });
}

function upgrade(state: GameState, b: Building): void {
  const next = tierDef((b.tier ?? 1) + 1);
  for (const [g, n] of Object.entries(next.upgradeCost)) state.goods[g as GoodId] -= n ?? 0;
  b.tier = next.id;
  b.content = 0;
  // New needs start out satisfied, so the house gets a moment to settle in.
  b.supply = {};
  pushFx(state, { kind: 'upgrade', id: b.id, tier: next.id });
}

/** Unlock the next tier once enough people live in the current top tier. */
function updateUnlocks(state: GameState): void {
  while (state.unlockedTier < MAX_TIER) {
    const next = tierDef(state.unlockedTier + 1);
    if (populationOfTier(state, state.unlockedTier) < unlockThreshold(state, next.id)) break;
    state.unlockedTier++;
  }
}

/** Residents of the tier below needed to unlock a tier. Later cycles remember the way and need fewer. */
export function unlockThreshold(state: GameState, tier: number): number {
  const base = tierDef(tier).unlockResidents;
  return state.cycle > 1 ? Math.round(base * BALANCE.knowledgeUnlockFactor) : base;
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
  if (state.unlockedTier <= tierId) return `${next.name} unlock at ${unlockThreshold(state, next.id)} ${tier.name}.`;
  if (!derived(state).connected.has(b.id)) return 'Needs a road to a warehouse.';
  if (!isBuildingLit(state, b)) return 'Too dark: the house needs light.';
  if ((b.residents ?? 0) < tier.maxResidents) return 'The house must be full.';
  if (!needsMet(b)) return `${tier.name} needs must be met.`;
  // Don't move people up into a tier whose goods you can't supply yet.
  const missing = next.needs
    .filter((n) => state.goods[n.good] < Math.max(1, next.upgradeCost[n.good] ?? 0))
    .map((n) => GOODS[n.good].name.toLowerCase());
  if (missing.length) return `Waiting for ${missing.join(' and ')} in the warehouse.`;
  const cost = Object.entries(next.upgradeCost) as [GoodId, number][];
  if (cost.some(([g, n]) => state.goods[g] < n)) return `Upgrading costs ${goodsList(next.upgradeCost)}.`;
  return null;
}

/** Does the house get its tier's luxury bonus? */
export function hasLuxury(state: GameState, b: Building): boolean {
  return servedBy(state, b, tierDef(b.tier ?? 1).luxury);
}

/** How well a house's needs are met, 0..1: its worst-supplied need. */
export function needSatisfaction(b: Building): number {
  return Math.min(1, ...tierDef(b.tier ?? 1).needs.map((n) => b.supply?.[n.good] ?? 1));
}

/**
 * Share of full tax a house pays for how well its needs are met: all of it once they are met,
 * tapering to nothing at `BALANCE.taxCutoff`. A short shortage dents income instead of ending it.
 */
export function taxShare(b: Building): number {
  const sat = needSatisfaction(b);
  if (sat >= BALANCE.needMetThreshold) return 1;
  return Math.max(0, (sat - BALANCE.taxCutoff) / (BALANCE.needMetThreshold - BALANCE.taxCutoff));
}

/** Coins per minute this house pays right now. */
export function houseTax(state: GameState, b: Building): number {
  if (b.type !== 'house' || (b.status !== 'ok' && b.status !== 'needsUnmet')) return 0;
  let tax = (b.residents ?? 0) * tierDef(b.tier ?? 1).tax * taxShare(b);
  if (hasLuxury(state, b)) tax *= 1 + BALANCE.luxuryTaxBonus;
  if (hasRelic(state, 'ledger')) tax *= 1.1;
  return tax;
}

/** Name of a building, used in messages. */
export function buildingName(b: Building): string {
  return b.type === 'house' ? `${tierDef(b.tier ?? 1).single} house` : BUILDINGS[b.type].name;
}
