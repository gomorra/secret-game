import type { GoodId } from './goods';

export interface NeedDef {
  good: GoodId;
  /** Units per resident per minute. */
  rate: number;
}

export interface TierDef {
  id: number;
  name: string;
  maxResidents: number;
  /** Coins per resident per minute, paid only while basic needs are met. */
  tax: number;
  needs: NeedDef[];
}

export const TIERS: TierDef[] = [
  {
    id: 1,
    name: 'Castaways',
    maxResidents: 8,
    tax: 1.5,
    needs: [
      { good: 'fish', rate: 0.15 },
      { good: 'wood', rate: 0.08 },
    ],
  },
];

export function tierDef(tier: number): TierDef {
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, tier - 1))];
}
