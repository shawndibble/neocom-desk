/**
 * Skill point math.
 * SP(level) = 250 * rank * sqrt(32)^(level-1), rounded up (matches in-game
 * cumulative totals for rank 1: 250 / 1,415 / 8,000 / 45,255 / 256,000).
 * Source: EVE University wiki, "Skills and learning".
 */

const SQRT_32_EXP = 2.5; // sqrt(32) = 2^2.5

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`level must be an integer 0..5, got ${level}`);
  }
}

function assertRank(rank: number): void {
  if (!(rank > 0)) {
    throw new RangeError(`rank must be > 0, got ${rank}`);
  }
}

/** Cumulative SP required to have a skill of the given rank at `level`. */
export function spForLevel(rank: number, level: number): number {
  assertRank(rank);
  assertLevel(level);
  if (level === 0) return 0;
  return Math.ceil(250 * rank * 2 ** (SQRT_32_EXP * (level - 1)));
}

/** SP needed to go from `fromLevel` to `toLevel`. */
export function spBetween(rank: number, fromLevel: number, toLevel: number): number {
  if (fromLevel > toLevel) {
    throw new RangeError(`fromLevel (${fromLevel}) must be <= toLevel (${toLevel})`);
  }
  return spForLevel(rank, toLevel) - spForLevel(rank, fromLevel);
}

/** Training speed in SP per minute (Omega): primary + secondary/2. */
export function trainingRate(primaryVal: number, secondaryVal: number): number {
  if (!(primaryVal > 0) || !(secondaryVal > 0)) {
    throw new RangeError('attribute values must be > 0');
  }
  return primaryVal + secondaryVal / 2;
}

/** Seconds to train `sp` skill points at `rate` SP/minute. */
export function timeToTrain(sp: number, rate: number): number {
  if (sp < 0) throw new RangeError(`sp must be >= 0, got ${sp}`);
  if (!(rate > 0)) throw new RangeError(`rate must be > 0, got ${rate}`);
  return (sp / rate) * 60;
}
