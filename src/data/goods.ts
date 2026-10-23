/** All goods in the prototype. */
export const GOODS = {
  wood: { name: 'Wood', color: 0x9a6b3f },
  planks: { name: 'Planks', color: 0xd0a36a },
  stone: { name: 'Stone', color: 0x9aa0a6 },
  fish: { name: 'Fish', color: 0x6fa8c7 },
  wheat: { name: 'Wheat', color: 0xd8c06a },
  flour: { name: 'Flour', color: 0xeee3c8 },
  bread: { name: 'Bread', color: 0xc8874a },
  blubber: { name: 'Blubber', color: 0x8a7a6a },
  lampOil: { name: 'Lamp oil', color: 0xffc46b },
  wax: { name: 'Wax', color: 0xe8d27a },
  candles: { name: 'Candles', color: 0xf6ead0 },
  reeds: { name: 'Reeds', color: 0x7f9a5a },
  paper: { name: 'Paper', color: 0xddd6c4 },
  ink: { name: 'Ink', color: 0x4a4f7a },
  books: { name: 'Books', color: 0x8a3f3f },
} as const;

export type GoodId = keyof typeof GOODS;
export type GoodAmounts = Partial<Record<GoodId, number>>;

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
