import { describe, it, expect } from 'vitest';
import { spForLevel, spBetween, remainingSpForLevel, trainingRate, timeToTrain } from '@/engine/sp';

// Canonical cumulative SP totals for rank 1 (EVE University wiki, in-game values)
describe('spForLevel', () => {
  it('matches canonical rank-1 totals', () => {
    expect(spForLevel(1, 1)).toBe(250);
    expect(spForLevel(1, 2)).toBe(1415);
    expect(spForLevel(1, 3)).toBe(8000);
    expect(spForLevel(1, 4)).toBe(45255);
    expect(spForLevel(1, 5)).toBe(256000);
  });

  it('is zero at level 0', () => {
    expect(spForLevel(1, 0)).toBe(0);
    expect(spForLevel(8, 0)).toBe(0);
  });

  it('scales linearly with rank, rounded up after multiplying', () => {
    // 45254.83... * 3 = 135764.5 -> 135765
    expect(spForLevel(3, 4)).toBe(135765);
    expect(spForLevel(2, 1)).toBe(500);
    expect(spForLevel(16, 5)).toBe(4096000);
    // 1414.21... * 5 = 7071.06 -> 7072
    expect(spForLevel(5, 2)).toBe(7072);
  });

  it('rejects invalid level or rank', () => {
    expect(() => spForLevel(1, -1)).toThrow(RangeError);
    expect(() => spForLevel(1, 6)).toThrow(RangeError);
    expect(() => spForLevel(1, 2.5)).toThrow(RangeError);
    expect(() => spForLevel(0, 3)).toThrow(RangeError);
    expect(() => spForLevel(-2, 3)).toThrow(RangeError);
  });
});

describe('spBetween', () => {
  it('is the difference of cumulative totals', () => {
    expect(spBetween(1, 0, 5)).toBe(256000);
    expect(spBetween(1, 3, 4)).toBe(45255 - 8000);
    expect(spBetween(1, 1, 2)).toBe(1415 - 250);
    expect(spBetween(3, 3, 4)).toBe(135765 - 24000);
  });

  it('is zero for equal levels', () => {
    expect(spBetween(1, 4, 4)).toBe(0);
  });

  it('rejects fromLevel > toLevel', () => {
    expect(() => spBetween(1, 4, 2)).toThrow(RangeError);
  });
});

describe('remainingSpForLevel', () => {
  it('is the whole level when the skill sits exactly at the level below', () => {
    // A skill at exactly its boundary has banked nothing toward the next
    // level. `spForLevel` rounds up, so an off-by-one here would invent a
    // phantom credit on every skill in every plan.
    //
    // Anchored on literals, not on `spForLevel`/`spBetween`: expressing both
    // sides in terms of the same function passes for any monotone
    // implementation, including one crediting `currentSp - start + 1`, since
    // the expected value would move with the bug.
    expect(remainingSpForLevel(1, 4, 8_000)).toBe(37_255);
    expect(remainingSpForLevel(1, 1, 0)).toBe(250);
    expect(remainingSpForLevel(6, 4, spForLevel(6, 3))).toBe(spBetween(6, 3, 4));
  });

  it('is the whole level when the skill is untrained', () => {
    // One level's cost, not the cumulative to it: a level-3 step for an
    // untrained skill still costs only level 3, since levels 1 and 2 are
    // steps of their own.
    expect(remainingSpForLevel(1, 1, 0)).toBe(250);
    expect(remainingSpForLevel(2, 3, 0)).toBe(spBetween(2, 2, 3));
  });

  it('credits SP already banked inside the level in progress', () => {
    // The user's Coherent Ore Processing IV: rank 6, memory/intelligence.
    // L3 = 48,000 SP, L4 = 271,530 SP, so the level costs 223,530 SP. Their
    // in-game queue reported 1d 9h left at 56.5 SP/min = 111,870 SP still to
    // go, which is 159,660 SP already banked — a level half paid for that the
    // plan was charging in full.
    expect(spForLevel(6, 3)).toBe(48_000);
    expect(spForLevel(6, 4)).toBe(271_530);
    expect(spBetween(6, 3, 4)).toBe(223_530);
    expect(remainingSpForLevel(6, 4, 159_660)).toBe(111_870);
  });

  it('clamps to zero once the level is already paid for, never negative', () => {
    expect(remainingSpForLevel(1, 4, spForLevel(1, 4))).toBe(0);
    expect(remainingSpForLevel(1, 4, spForLevel(1, 5))).toBe(0);
    expect(remainingSpForLevel(1, 4, 10_000_000)).toBe(0);
  });

  it('ignores SP below the level in progress rather than double-counting it', () => {
    // Costing level 5 for a skill whose SP only reaches level 3 must not
    // subtract that level-3 SP from level 5's own cost.
    expect(remainingSpForLevel(1, 5, spForLevel(1, 3))).toBe(spBetween(1, 4, 5));
  });

  it('treats a negative currentSp as untrained rather than inflating the cost', () => {
    expect(remainingSpForLevel(1, 2, -500)).toBe(spBetween(1, 1, 2));
  });

  it('rejects invalid level or rank, like the rest of this module', () => {
    expect(() => remainingSpForLevel(1, 0, 0)).toThrow(RangeError);
    expect(() => remainingSpForLevel(1, 6, 0)).toThrow(RangeError);
    expect(() => remainingSpForLevel(0, 3, 0)).toThrow(RangeError);
  });
});

describe('trainingRate', () => {
  it('is primary + secondary/2 SP per minute', () => {
    expect(trainingRate(20, 20)).toBe(30);
    expect(trainingRate(17, 17)).toBe(25.5);
    expect(trainingRate(27, 21)).toBe(37.5);
  });

  it('rejects non-positive attributes', () => {
    expect(() => trainingRate(0, 20)).toThrow(RangeError);
    expect(() => trainingRate(20, -1)).toThrow(RangeError);
  });
});

describe('timeToTrain', () => {
  it('converts SP at SP/min rate to seconds', () => {
    // 2700 SP at 27 SP/min = 100 min = 6000 s
    expect(timeToTrain(2700, 27)).toBe(6000);
    expect(timeToTrain(250, 25)).toBe(600);
  });

  it('is zero for zero SP', () => {
    expect(timeToTrain(0, 30)).toBe(0);
  });

  it('rejects non-positive rate and negative SP', () => {
    expect(() => timeToTrain(100, 0)).toThrow(RangeError);
    expect(() => timeToTrain(-1, 30)).toThrow(RangeError);
  });
});
