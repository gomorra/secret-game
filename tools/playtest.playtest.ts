import { it } from 'vitest';
import { createGame, populationOfTier } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { Bot, census } from './bot';

/**
 * Balance playtest: a bot plays several islands and we watch the pace.
 * Run with `npm run playtest`. Env: SEEDS=a,b,c  MINUTES=60  VERBOSE=1
 */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const SEEDS = (env.SEEDS ?? 'fog,lantern,bell,tide,ember,moth,wick,cove,ash,reed').split(',');
const MINUTES = Number(env.MINUTES ?? 60);

interface Result {
  seed: string;
  tier2?: number;
  tier3?: number;
  firstT2House?: number;
  firstT3House?: number;
  scholars30?: number;
  lowCoins: number;
  lost: number;
  final: Record<string, number>;
}

function mmss(t?: number): string {
  if (t === undefined) return '  —  ';
  return `${String(Math.floor(t / 60)).padStart(2, ' ')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

it('plays', () => {
  const results: Result[] = [];
  for (const seed of SEEDS) {
    const s = createGame(seed);
    const bot = new Bot(s);
    const r: Result = { seed, lowCoins: s.coins, lost: 0, final: {} };
    const rows: Record<string, number>[] = [];
    while (s.time < MINUTES * 60) {
      bot.act();
      advance(s, bot.turn);
      if (r.tier2 === undefined && s.unlockedTier >= 2) r.tier2 = s.time;
      if (r.tier3 === undefined && s.unlockedTier >= 3) r.tier3 = s.time;
      if (r.firstT2House === undefined && s.buildings.some((b) => b.type === 'house' && b.tier === 2)) r.firstT2House = s.time;
      if (r.firstT3House === undefined && s.buildings.some((b) => b.type === 'house' && b.tier === 3)) r.firstT3House = s.time;
      if (r.scholars30 === undefined && populationOfTier(s, 3) >= 30) r.scholars30 = s.time;
      r.lowCoins = Math.min(r.lowCoins, s.coins);
      if (Math.round(s.time) % (Number(env.EVERY ?? 300)) === 0) rows.push(census(s));
    }
    r.lost = s.lost;
    r.final = census(s);
    results.push(r);
    if (env.VERBOSE) {
      console.log(`\n=== ${seed} ===`);
      console.table(rows);
      console.log(bot.log.join('\n'));
    }
  }
  console.log('\nseed      T2 unlock  first T2  T3 unlock  first T3  30 Scholars  low coins  lost  final');
  for (const r of results) {
    console.log(
      [
        r.seed.padEnd(9),
        mmss(r.tier2).padStart(9),
        mmss(r.firstT2House).padStart(9),
        mmss(r.tier3).padStart(10),
        mmss(r.firstT3House).padStart(9),
        mmss(r.scholars30).padStart(12),
        String(Math.round(r.lowCoins)).padStart(10),
        String(r.lost).padStart(5),
        ` ${JSON.stringify(r.final)}`,
      ].join(' '),
    );
  }
}, 600_000);
