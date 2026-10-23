import { it } from 'vitest';
import { createGame } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { serialize } from '../src/sim/save';
import { Bot } from './bot';

/** Write a save of a bot colony, to look at in the browser. Env: SEED, AT (minutes), OUT. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
it('snapshot', async () => {
  // Node's fs, without needing Node's type definitions in this browser project.
  const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
    writeFileSync(path: string, data: string): void;
    mkdirSync(path: string, opts: { recursive: boolean }): void;
  };
  const s = createGame(env.SEED ?? 'fog');
  const bot = new Bot(s);
  while (s.time < Number(env.AT ?? 40) * 60) {
    bot.act();
    advance(s, bot.turn);
  }
  if (!env.OUT) fs.mkdirSync('tools/out', { recursive: true });
  fs.writeFileSync(env.OUT ?? 'tools/out/snapshot.json', serialize(s));
});
