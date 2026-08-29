import { describe, it, expect } from 'vitest';
import { spForLevel, spBetween, trainingRate, timeToTrain } from '@/engine/sp';

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
