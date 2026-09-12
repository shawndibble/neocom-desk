import { describe, it, expect } from 'vitest';
import {
  corpusGoingRate,
  goingRateMultiple,
  paysFarAboveGoingRate,
  communityFloorReward,
  MIN_GOING_RATE_SAMPLE,
  FAR_ABOVE_MULTIPLE,
} from '@/engine/contracts/courierGoingRate';
import { rewardPerVolumeJump } from '@/engine/contracts/courierRates';
import {
  forcesFreighter,
  hoursToExpiry,
  FREIGHTER_VOLUME_M3,
} from '@/engine/contracts/courierRisk';

describe('rewardPerVolumeJump', () => {
  it('normalises a reward by both the size of the load and the length of the trip', () => {
    // 15M for 45,000 m³ over 9 jumps.
    expect(rewardPerVolumeJump(15_000_000, 45_000, 9)).toBeCloseTo(37.04, 2);
  });

  it('has no rate for a haul that states no cargo', () => {
    // A courier contract carries no item lines, so a zero volume is a figure
    // the snapshot genuinely holds — not a divisor.
    expect(rewardPerVolumeJump(10_000_000, 0, 5)).toBeNull();
  });

  it('has no rate when the distance is unavailable', () => {
    // An unroutable or unplaced endpoint has no jump count, and a rate
    // computed without distance is not the rate this compares.
    expect(rewardPerVolumeJump(10_000_000, 1_000, null)).toBeNull();
  });

  it('counts a same-system haul as one jump, the way the ISK/jump column does', () => {
    // Zero jumps is a real answer (both ends in one system), not a missing
    // one. Dividing by it would read as an infinite rate and top every
    // outlier list; the sibling rate already settled this convention.
    expect(rewardPerVolumeJump(1_000_000, 1_000, 0)).toBe(1_000);
  });
});

describe('corpusGoingRate', () => {
  function corpus(n: number, value = 40): (number | null)[] {
    return Array.from({ length: n }, () => value);
  }

  it('is the median of the rates the corpus can state', () => {
    expect(corpusGoingRate([...corpus(MIN_GOING_RATE_SAMPLE - 1, 10), 1_000_000])).toBe(10);
  });

  it('takes the mean of the middle pair on an even sample', () => {
    // Discriminating on purpose: the two middle values differ, so lower-middle
    // (10), upper-middle (30) and mean-of-pair (20) are three different
    // answers and only one of them passes.
    const rates = [
      ...corpus(MIN_GOING_RATE_SAMPLE / 2 - 1, 10),
      10,
      30,
      ...corpus(MIN_GOING_RATE_SAMPLE / 2 - 1, 40),
    ];
    expect(rates).toHaveLength(MIN_GOING_RATE_SAMPLE);
    expect(corpusGoingRate(rates)).toBe(20);
  });

  it('ignores the hauls that have no rate rather than counting them as zero', () => {
    const rates: (number | null)[] = [...corpus(MIN_GOING_RATE_SAMPLE, 50), null, null, null];
    expect(corpusGoingRate(rates)).toBe(50);
  });

  it('has no going rate for a corpus too small to have a meaningful one', () => {
    // A median over a handful of rows is arithmetically fine and statistically
    // meaningless — and this one decides whether a contract is called an
    // outlier, so the whole feature degrades to showing nothing rather than
    // calling every row several times the median of two.
    expect(corpusGoingRate([])).toBeNull();
    expect(corpusGoingRate([40])).toBeNull();
    expect(corpusGoingRate(corpus(MIN_GOING_RATE_SAMPLE - 1))).toBeNull();
    expect(corpusGoingRate(corpus(MIN_GOING_RATE_SAMPLE))).toBe(40);
  });

  it('counts only the rows that could state a rate towards the sample', () => {
    const rates: (number | null)[] = [...corpus(MIN_GOING_RATE_SAMPLE - 1), null, null, null];
    expect(corpusGoingRate(rates)).toBeNull();
  });
});

describe('goingRateMultiple', () => {
  it('states how many times the going rate this haul pays', () => {
    expect(goingRateMultiple(400, 50)).toBe(8);
  });

  it('has no multiple without both halves of the comparison', () => {
    expect(goingRateMultiple(null, 50)).toBeNull();
    expect(goingRateMultiple(400, null)).toBeNull();
    // A going rate of zero would make every multiple infinite.
    expect(goingRateMultiple(400, 0)).toBeNull();
  });
});

describe('paysFarAboveGoingRate', () => {
  it('separates the documented bait from ordinary small-parcel work', () => {
    // Measured against the ticket's own figures: an honest short hop already
    // runs ~3.6x the median of ordinary work, while the documented bait sits at
    // 20x and up. The threshold has to clear the first without reaching the
    // second.
    expect(paysFarAboveGoingRate(3.6)).toBe(false);
    expect(paysFarAboveGoingRate(FAR_ABOVE_MULTIPLE)).toBe(true);
    expect(paysFarAboveGoingRate(20)).toBe(true);
  });

  it('says nothing about a haul whose rate cannot be stated', () => {
    expect(paysFarAboveGoingRate(null)).toBe(false);
  });
});

describe('communityFloorReward', () => {
  it('is one million per billion of collateral per jump', () => {
    // The haulers' guide benchmark: 2B over 10 jumps should pay at least 20M.
    expect(communityFloorReward(2_000_000_000, 10)).toBe(20_000_000);
  });

  it('has no floor without a distance, and none for a haul asking no collateral', () => {
    expect(communityFloorReward(2_000_000_000, null)).toBeNull();
    // Nothing at risk, so the benchmark that prices risk says nothing.
    expect(communityFloorReward(0, 10)).toBeNull();
  });
});

describe('forcesFreighter', () => {
  it('is a load no smaller hull can carry', () => {
    // Above this a freighter is the only option: slow, uncloakable, and the
    // easiest gank target in the game — which is bait regardless of the pay,
    // and is why the rate multiple alone would miss this shape entirely.
    expect(forcesFreighter(FREIGHTER_VOLUME_M3 + 1)).toBe(true);
    expect(forcesFreighter(60_000)).toBe(false);
  });
});

describe('hoursToExpiry', () => {
  it('counts the hours a hauler has left to decide', () => {
    const now = Date.parse('2026-09-12T00:00:00Z');
    expect(hoursToExpiry(Date.parse('2026-09-12T19:00:00Z'), now)).toBe(19);
  });

  it('is zero for a contract already lapsed, never negative', () => {
    const now = Date.parse('2026-09-12T00:00:00Z');
    expect(hoursToExpiry(Date.parse('2026-09-11T00:00:00Z'), now)).toBe(0);
  });
});
