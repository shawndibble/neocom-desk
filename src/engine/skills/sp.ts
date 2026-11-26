import { clamp } from '../math';
import type { CloneState } from '@/engine/types';

const SQRT_32_EXP = 2.5;

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

export function spForLevel(rank: number, level: number): number {
  assertRank(rank);
  assertLevel(level);
  if (level === 0) return 0;
  return Math.ceil(250 * rank * 2 ** (SQRT_32_EXP * (level - 1)));
}

export function spBetween(rank: number, fromLevel: number, toLevel: number): number {
  if (fromLevel > toLevel) {
    throw new RangeError(`fromLevel (${fromLevel}) must be <= toLevel (${toLevel})`);
  }
  return spForLevel(rank, toLevel) - spForLevel(rank, fromLevel);
}

export function remainingSpForLevel(rank: number, level: number, currentSp: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new RangeError(`level must be an integer 1..5, got ${level}`);
  }
  const start = spForLevel(rank, level - 1);
  const end = spForLevel(rank, level);
  const banked = clamp(currentSp, start, end);
  return end - banked;
}

export function progressToNextLevel(rank: number, level: number, currentSp: number): number | null {
  assertRank(rank);
  assertLevel(level);
  if (level === 5) return null;
  const start = spForLevel(rank, level);
  const end = spForLevel(rank, level + 1);
  const fraction = (currentSp - start) / (end - start);
  return Math.min(1, Math.max(0, fraction));
}

const ALPHA_RATE_FACTOR = 0.5;

export function trainingRate(
  primaryVal: number,
  secondaryVal: number,
  cloneState: CloneState = 'omega'
): number {
  if (!(primaryVal > 0) || !(secondaryVal > 0)) {
    throw new RangeError('attribute values must be > 0');
  }
  const omega = primaryVal + secondaryVal / 2;
  return cloneState === 'alpha' ? omega * ALPHA_RATE_FACTOR : omega;
}

export function timeToTrain(sp: number, rate: number): number {
  if (sp < 0) throw new RangeError(`sp must be >= 0, got ${sp}`);
  if (!(rate > 0)) throw new RangeError(`rate must be > 0, got ${rate}`);
  return (sp / rate) * 60;
}
