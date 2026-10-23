import { it } from 'vitest';
import { createGame } from '../src/sim/state';
import { Terrain } from '../src/sim/map';

/** How far each kind of ground is from the landing, per island. */
it('terrain reach', () => {
  const kinds: [string, number][] = [['forest', Terrain.Forest], ['fertile', Terrain.Fertile], ['rock', Terrain.Rock], ['marsh', Terrain.Marsh], ['grass', Terrain.Grass]];
  const rows: Record<string, number | string>[] = [];
  const seeds = Array.from({ length: 40 }, (_, i) => `s${i}`).concat(['fog', 'lantern', 'bell', 'tide', 'ember', 'moth', 'wick', 'cove', 'ash', 'reed']);
  for (const seed of seeds) {
    const s = createGame(seed);
    const w = s.buildings.find((b) => b.type === 'warehouse')!;
    const W = s.map.width;
    const row: Record<string, number | string> = { seed };
    for (const [name, t] of kinds) {
      // Distance to the nearest patch: a tile with at least 6 of the kind within radius 2.
      let best = 99;
      for (let i = 0; i < s.map.terrain.length; i++) {
        if (s.map.terrain[i] !== t) continue;
        const x = i % W, y = (i - x) / W;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s.map.terrain[(y + dy) * W + x + dx] === t) n++;
        if (n < 6) continue;
        best = Math.min(best, Math.round(Math.hypot(x - w.x, y - w.y)));
      }
      row[name] = best;
    }
    rows.push(row);
  }
  console.table(rows);
  for (const [name] of kinds) {
    const v = rows.map((r) => r[name] as number).sort((a, b) => a - b);
    console.log(name, 'median', v[Math.floor(v.length / 2)], 'p90', v[Math.floor(v.length * 0.9)], 'max', v[v.length - 1]);
  }
});
