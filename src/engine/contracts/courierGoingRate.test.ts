import { describe, it, expect } from 'vitest';
import {
  corpusGoingRate,
  goingRateMultiple,
  paysFarAboveGoingRate,
  communityFloorReward,
  floorShare,
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
    expect(rewardPerVolumeJump(15_000_000, 45_000, 9)).toBeCloseTo(37.04, 2);
  });

  it('has no rate for a haul that states no cargo', () => {
    expect(rewardPerVolumeJump(10_000_000, 0, 5)).toBeNull();
  });

  it('has no rate when the distance is unavailable', () => {
    expect(rewardPerVolumeJump(10_000_000, 1_000, null)).toBeNull();
  });

  it('counts a same-system haul as one jump, the way the ISK/jump column does', () => {
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
    expect(goingRateMultiple(400, 0)).toBeNull();
  });
});

describe('paysFarAboveGoingRate', () => {
  it('separates the documented bait from ordinary small-parcel work', () => {
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
    expect(communityFloorReward(2_000_000_000, 10)).toBe(20_000_000);
  });

  it('has no floor without a distance, and none for a haul asking no collateral', () => {
    expect(communityFloorReward(2_000_000_000, null)).toBeNull();
    expect(communityFloorReward(0, 10)).toBeNull();
  });
});

describe('floorShare', () => {
  it('is the reward as a fraction of the community floor', () => {
    expect(floorShare(45_000_000, 153_000_000)).toBeCloseTo(0.294, 3);
    expect(floorShare(20_000_000, 20_000_000)).toBe(1);
  });

  it('has no share where there is no floor', () => {
    expect(floorShare(45_000_000, null)).toBeNull();
  });
});

describe('forcesFreighter', () => {
  it('is a load no smaller hull can carry', () => {
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
