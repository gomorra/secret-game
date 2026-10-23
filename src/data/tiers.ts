import type { BuildingId } from './buildings';
import type { GoodAmounts, GoodId } from './goods';

export interface NeedDef {
  good: GoodId;
  /** Units per resident per minute. */
  rate: number;
}

export interface TierDef {
  id: number;
  name: string;
  /** Singular, for "a Castaway house". */
  single: string;
  color: number;
  maxResidents: number;
  /** Coins per resident per minute at full need supply. Tapers as needs run short (see `taxShare`). */
  tax: number;
  needs: NeedDef[];
  /** Service building that gives this tier a tax bonus when it's nearby. */
  luxury: BuildingId;
  /** Residents of the previous tier needed to unlock this tier and its buildings. */
  unlockResidents: number;
  /**
   * Paid when a house upgrades into this tier. Includes a first stock of the tier's own goods,
   * so houses move up one by one as supply allows instead of all at once.
   */
  upgradeCost: GoodAmounts;
}

export const TIERS: TierDef[] = [
  {
    id: 1,
    name: 'Castaways',
    single: 'Castaway',
    color: 0xb08a5a,
    maxResidents: 8,
    tax: 2,
    needs: [
      { good: 'fish', rate: 0.15 },
      { good: 'wood', rate: 0.08 },
    ],
    luxury: 'shrine',
    unlockResidents: 0,
    upgradeCost: {},
  },
  {
    id: 2,
    name: 'Lamplighters',
    single: 'Lamplighter',
    color: 0xe0a24a,
    maxResidents: 12,
    tax: 3.5,
    needs: [
      { good: 'bread', rate: 0.12 },
      { good: 'lampOil', rate: 0.08 },
    ],
    luxury: 'tavern',
    unlockResidents: 60,
    upgradeCost: { planks: 3, bread: 3, lampOil: 2 },
  },
  {
    id: 3,
    name: 'Scholars',
    single: 'Scholar',
    color: 0x9a8ad0,
    maxResidents: 16,
    tax: 6,
    needs: [
      { good: 'candles', rate: 0.08 },
      { good: 'books', rate: 0.06 },
    ],
    luxury: 'archive',
    unlockResidents: 50,
    upgradeCost: { planks: 4, stone: 3, candles: 2, books: 2 },
  },
];

export const MAX_TIER = TIERS.length;

export function tierDef(tier: number): TierDef {
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, tier - 1))];
}
