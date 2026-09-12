import { describe, expect, it } from 'vitest';
import { initialRanks, rankBetween } from './lexorank.js';

describe('lexorank', () => {
  it('produces a key strictly between two open bounds', () => {
    const a = rankBetween(null, null);
    expect(a).toBeTruthy();
  });

  it('keeps ordering when repeatedly inserting between neighbours', () => {
    let lo = rankBetween(null, null);
    let hi = rankBetween(lo, null);
    for (let i = 0; i < 200; i += 1) {
      const mid = rankBetween(lo, hi);
      expect(lo < mid).toBe(true);
      expect(mid < hi).toBe(true);
      // alternate which side we subdivide to stress both branches
      if (i % 2 === 0) hi = mid;
      else lo = mid;
    }
  });

  it('initialRanks returns strictly increasing keys', () => {
    const ranks = initialRanks(50);
    const sorted = [...ranks].sort();
    expect(ranks).toEqual(sorted);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('rejects an inverted range', () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    expect(() => rankBetween(b, a)).toThrow();
  });
});
