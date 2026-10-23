import { describe, expect, it } from 'vitest';
import { fbm, hashString, Rng } from '../src/sim/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
    expect(hashString('fog')).not.toBe(hashString('fig'));
  });

  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      const f = fbm(i * 0.37, i * 0.11, 99);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});
