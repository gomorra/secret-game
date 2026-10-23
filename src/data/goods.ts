/** All goods in the prototype. Only some are produced so far; the rest arrive with later milestones. */
export const GOODS = {
  wood: { name: 'Wood', color: 0x9a6b3f },
  planks: { name: 'Planks', color: 0xd0a36a },
  stone: { name: 'Stone', color: 0x9aa0a6 },
  fish: { name: 'Fish', color: 0x6fa8c7 },
} as const;

export type GoodId = keyof typeof GOODS;
export type GoodAmounts = Partial<Record<GoodId, number>>;

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
