/** Tunable numbers. Balancing should mean editing this file, not the sim code. */
export const BALANCE = {
  /** Simulation step in seconds. */
  tick: 0.1,
  startCoins: 1500,
  startGoods: { wood: 40, planks: 20, fish: 20 },
  /** Storage per good, per warehouse. */
  warehouseStorage: 60,
  /** Share of a building's material cost you get back when demolishing it. */
  demolishRefund: 0.5,
  /** Seconds between residents moving into (or out of) a house. */
  houseGrowthInterval: 8,
  /** A house always fills up to this many residents, even without its needs met. */
  houseStarterResidents: 2,
  /** How fast a house's need satisfaction reacts to supply, in seconds. */
  needSmoothing: 4,
  /** Satisfaction at or above this counts as "met". */
  needMetThreshold: 0.9,
} as const;
