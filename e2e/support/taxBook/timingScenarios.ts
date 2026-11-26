import { MINUTE_MS } from '../../../src/lib/age';
import { BookSeed, DAY_QTY, RATE_PCT, type MinedDay } from './bookSeed';
import type { SeedDoc } from './emulator';
import { PILOT, PILOT_MINER_ID } from './memberSeed';

export function pilotBook(
  days: readonly (number | MinedDay)[],
  over: { tolerancePct?: number } = {}
) {
  return new BookSeed({ startBack: 40, ...over })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, days);
}

export const justNow = (minutesAgo = 10): string =>
  new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString();

export const taxAt = (price: number): number => (DAY_QTY * price * RATE_PCT) / 100;

export const ESTIMATE_PRICE = 1_000;
export const ESTIMATE = taxAt(ESTIMATE_PRICE);

export const SAME_DAY = 3;
export const NEXT_DAY = 2;

export const CLOSES = {
  slightlyLower: { price: 996 },
  slightlyHigher: { price: 1_004 },
  clearlyHigher: { price: 1_010 },
  clearlyLower: { price: 980 },
} as const;
export type CloseKind = keyof typeof CLOSES;

export type { SeedDoc };
