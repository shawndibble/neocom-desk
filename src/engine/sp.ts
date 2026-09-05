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

/**
 * SP still needed to finish `level`, given the skill currently holds
 * `currentSp` total skill points.
 *
 * This is what separates "how big is this level" (`spBetween`) from "how much
 * of it is left to train". A character part-way through a level has already
 * banked SP toward it, and charging the whole level anyway overstates the
 * plan — visibly so for the skill currently training, which is exactly where
 * a user compares the plan against the in-game queue.
 *
 * `currentSp` is clamped into the level's own band, so it is safe against the
 * two ways a real SP figure can sit outside it: below the level's start (SP
 * belonging to lower levels, which must not be discounted from this level's
 * cost) and at or past its end (a `/skills` read that has run ahead of the
 * plan, which costs zero rather than going negative). `spForLevel` rounds up,
 * so a skill sitting exactly at a boundary gets no phantom credit.
 */
export function remainingSpForLevel(rank: number, level: number, currentSp: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new RangeError(`level must be an integer 1..5, got ${level}`);
  }
  const start = spForLevel(rank, level - 1);
  const end = spForLevel(rank, level);
  const banked = Math.min(Math.max(currentSp, start), end);
  return end - banked;
}

/**
 * Fraction (0..1) of the next level already banked, or `null` at level 5
 * (there is no level 6 to progress toward). Feeds SkillBar's partial-fill
 * segment (#405) — a discrete pip per completed level hides that a skill
 * sitting at level 2 might be 90% of the way to level 3.
 */
export function progressToNextLevel(rank: number, level: number, currentSp: number): number | null {
  assertRank(rank);
  assertLevel(level);
  if (level === 5) return null;
  const start = spForLevel(rank, level);
  const end = spForLevel(rank, level + 1);
  const fraction = (currentSp - start) / (end - start);
  return Math.min(1, Math.max(0, fraction));
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
