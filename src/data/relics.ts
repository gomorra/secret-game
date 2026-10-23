/** Relics: permanent bonuses found in the fog. You keep them from cycle to cycle. */
export type RelicId = 'ember' | 'wick' | 'veil' | 'chime' | 'compass' | 'ledger';

export interface RelicDef {
  id: RelicId;
  name: string;
  effect: string;
  flavour: string;
}

export const RELICS: Record<RelicId, RelicDef> = {
  ember: {
    id: 'ember',
    name: 'Ember of the First Keeper',
    effect: 'Every light reaches 1 tile further.',
    flavour: 'A coal that has not cooled in a hundred years. It is warm in the hand, like a held breath.',
  },
  wick: {
    id: 'wick',
    name: "Lamplighter's Wick",
    effect: 'Lights burn 25% less fuel.',
    flavour: 'Braided from hair. Whose, the tag does not say.',
  },
  veil: {
    id: 'veil',
    name: 'Mourning Veil',
    effect: 'Dread rises 25% slower.',
    flavour: 'Black lace, dry despite the sea. Looking through it, the fog seems almost kind.',
  },
  chime: {
    id: 'chime',
    name: 'Tide Chime',
    effect: 'Surges shrink lights by 20% instead of 30%.',
    flavour: 'A little bronze bell, cast from the same metal as something much larger.',
  },
  compass: {
    id: 'compass',
    name: 'Brass Compass',
    effect: 'Production is 10% faster.',
    flavour: 'Its needle points away from the fog, always, whichever way you turn.',
  },
  ledger: {
    id: 'ledger',
    name: 'Salt-stained Ledger',
    effect: 'Houses pay 10% more tax.',
    flavour: 'The Lantern Company kept good books. The last pages list names, and then only tallies.',
  },
};

export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
