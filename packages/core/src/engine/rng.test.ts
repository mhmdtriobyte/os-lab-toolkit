import { describe, expect, it } from 'vitest';
import { rng } from './rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = rng(42);
    const b = rng(42);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });

  it('keeps integers in range', () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
