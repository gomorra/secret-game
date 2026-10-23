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
  /** Below this need satisfaction a house pays no tax; between it and "met", tax tapers. */
  taxCutoff: 0.5,
  /** Seconds a full, content house waits before it upgrades. */
  upgradeDelay: 20,
  /** Extra tax from a house's luxury building being in range. */
  luxuryTaxBonus: 0.25,

  // Light and fog
  /** Seconds for a light to bloom to full strength once fuelled. */
  lightRiseTime: 3,
  /** Seconds for a light to fade out once its fuel runs dry: the fog creeps back. */
  lightFadeTime: 20,
  /** Lights reveal (explore) this many tiles beyond their lit radius. */
  revealMargin: 2,

  // The Tolling
  firstTolling: 420,
  tollingCalm: 360,
  tollingWarning: 60,
  tollingSurge: 60,
  /** Light radii shrink by this share during a surge, unless burning double fuel. */
  surgeShrink: 0.3,
  /** Surge shrink with the Tide Chime relic. */
  surgeShrinkChime: 0.2,
  /** Seconds for the surge to roll in and back out. */
  surgeRamp: 5,

  // Dread (points per minute, 0..100)
  dreadUnlit: 35,
  dreadNeedsUnmet: 12,
  dreadSurge: 20,
  dreadShrine: -20,
  dreadContent: -6,
  /** No one moves in while dread is at or above this. */
  dreadNoGrowth: 50,
  /** Dread left behind in a house after its residents walk into the fog. */
  dreadAfterLoss: 30,
  /** Seconds an emptied house stands with its door open before anyone moves in again. */
  abandonTime: 90,

  // Secrets in the fog
  /** Sites stay at least this far (tiles) from the Last Lantern. */
  siteMinDistance: 10,
  journalSites: 10,
  ruinSites: 6,
  relicSites: 3,
  stoneSites: 2,
  /** Seconds for one Archive to decipher a page. */
  decipherTime: 90,
  /** Each accepted stone pact: extra production speed, and dread per minute for every house. */
  pactProduction: 0.5,
  pactDread: 8,
  /** Seconds into a surge before the first whisper, and between whispers. */
  firstWhisper: 6,
  whisperInterval: 18,
  /** From the second cycle on, tiers unlock with this share of the usual population. */
  knowledgeUnlockFactor: 0.7,
} as const;
