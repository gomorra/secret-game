import { describe, expect, it } from 'vitest';
import { createGame, populationOfTier } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { Bot } from '../tools/bot';

/**
 * A pace check on one island: the playtest bot should reach the milestones below in time.
 * If a balance change breaks this, run `npm run playtest` to see the whole picture.
 */
describe('pace', () => {
  it('reaches Lamplighters and unlocks Scholars in a reasonable time, without going broke', () => {
    const s = createGame('fog');
    const bot = new Bot(s);
    let firstT2: number | null = null;
    let lowCoins = s.coins;
    while (s.time < 30 * 60) {
      bot.act();
      advance(s, bot.turn);
      if (firstT2 === null && populationOfTier(s, 2) > 0) firstT2 = s.time;
      lowCoins = Math.min(lowCoins, s.coins);
    }
    // Not too fast: Castaways get a real chapter of their own.
    expect(firstT2).toBeGreaterThan(8 * 60);
    expect(firstT2).toBeLessThan(22 * 60);
    expect(s.unlockedTier).toBe(3);
    expect(lowCoins).toBeGreaterThan(-100);
    expect(s.lost).toBeLessThan(20);
  }, 60_000);
});
