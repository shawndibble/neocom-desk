import { describe, expect, it } from 'vitest';
import {
  fleetNames,
  fleetPayoutProgress,
  holdBackIsk,
  isExpired,
  mySharesOf,
  splitIsk,
  type FleetPayout,
} from './fleetPayouts';

const payout = (over: Partial<FleetPayout> = {}): FleetPayout => ({
  id: 'p1',
  ownerUid: 'char:1',
  ownerName: 'Boss',
  name: 'Roam',
  totalIsk: 100,
  holdBackPct: 0,
  rule: 'equal',
  memberUids: [],
  shareCount: 4,
  paidCount: 1,
  createdAt: 0,
  expiresAt: 1000,
  ...over,
});

describe('fleetNames', () => {
  it('trims, drops blanks, dedupes case-insensitively keeping the first spelling', () => {
    expect(fleetNames('  Alice \r\n\nbob\nALICE\nBob\nCarol')).toEqual(['Alice', 'bob', 'Carol']);
  });
  it('does not cap the list', () => {
    const text = Array.from({ length: 300 }, (_, i) => `Pilot ${i}`).join('\n');
    expect(fleetNames(text)).toHaveLength(300);
  });
});

describe('splitIsk', () => {
  it('splits equally after the hold-back, leaving the remainder unallocated', () => {
    expect(splitIsk(1000, 10, 'equal', [1, 5, 9])).toEqual([300, 300, 300]);
  });
  it('splits by weight, flooring each', () => {
    expect(splitIsk(100, 0, 'weighted', [1, 2])).toEqual([33, 66]);
  });
  it('never allocates more than the net', () => {
    const out = splitIsk(1_000_003, 7, 'weighted', [3, 5, 7, 11]);
    expect(out.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(Math.floor((1_000_003 * 93) / 100));
  });
  it('zero pilots or zero total weight gives nothing to pay', () => {
    expect(splitIsk(100, 0, 'equal', [])).toEqual([]);
    expect(splitIsk(100, 0, 'weighted', [0, 0])).toEqual([0, 0]);
  });
});

describe('holdBackIsk', () => {
  it('is the total less the net', () => {
    expect(holdBackIsk(1001, 10)).toBe(1001 - 900);
    expect(holdBackIsk(1000, 0)).toBe(0);
  });
});

describe('fleetPayoutProgress', () => {
  it('counts paid shares', () => {
    expect(fleetPayoutProgress(payout())).toEqual({ paid: 1, total: 4, done: false });
    expect(fleetPayoutProgress(payout({ paidCount: 4 })).done).toBe(true);
    expect(fleetPayoutProgress(payout({ shareCount: 0, paidCount: 0 })).done).toBe(false);
  });
});

describe('mySharesOf', () => {
  it('keeps payouts listing the uid', () => {
    const list = [payout({ id: 'a', memberUids: ['char:2'] }), payout({ id: 'b' })];
    expect(mySharesOf(list, 'char:2').map((p) => p.id)).toEqual(['a']);
  });
});

describe('isExpired', () => {
  it('is true at and after expiresAt', () => {
    expect(isExpired(payout(), 999)).toBe(false);
    expect(isExpired(payout(), 1000)).toBe(true);
  });
});
