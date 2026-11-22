/**
 * Timing and pricing of money against a Corp Tax Book (`miningTaxTiming.book.spec.ts`): a payment
 * that reaches the pilot's device, the book or an officer's hand first, and a day the pilot paid on
 * an estimate that the book then prices at its close.
 *
 * The clock is real, so a day "before its close" is today (the book synced a minute ago, and a
 * day is Billable only once its grace has passed and a sync came after), and a day "after its
 * close" is one a few days back. Prices are `prices.ts`'s flat ones, except the days a scenario
 * moves (`installDayPrices`): a day mined `DAY_QTY` at `price` owes `price` x 1,000 ISK at 10%.
 */
import { MINUTE_MS } from '../../../src/lib/age';
import { BookSeed, DAY_QTY, RATE_PCT, type MinedDay } from './bookSeed';
import type { SeedDoc } from './emulator';
import { PILOT, PILOT_MINER_ID } from './memberSeed';

/** The pilot's one-character Miner in a book that started long before any day here. */
export function pilotBook(
  days: readonly (number | MinedDay)[],
  over: { tolerancePct?: number } = {}
) {
  return new BookSeed({ startBack: 40, ...over })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, days);
}

/** A payment sent just now, whatever the hour: dated today, never ahead of the clock. */
export const justNow = (minutesAgo = 10): string =>
  new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString();

/** What a mined day owes at a close-of-day price of `price`: `DAY_QTY` units at the book's rate. */
export const taxAt = (price: number): number => (DAY_QTY * price * RATE_PCT) / 100;

/** The pilot's estimate when they paid: the flat price (`UNIT_PRICE`) the Tax tab valued the day at. */
export const ESTIMATE_PRICE = 1_000;
export const ESTIMATE = taxAt(ESTIMATE_PRICE);

/** The day mined and paid on in the "after its close" cases, and the one after it. */
export const SAME_DAY = 3;
export const NEXT_DAY = 2;

/**
 * Where the book's close-of-day price lands against the pilot's estimate. The book's per-day
 * tolerance is 0.5% of the day's tax at close.
 */
export const CLOSES = {
  /** 0.4% under: the payment is more than the day, the rest is credit. */
  slightlyLower: { price: 996 },
  /** 0.4% over: short 4,000 of 1,004,000, inside the 5,020 tolerance, so forgiven. */
  slightlyHigher: { price: 1_004 },
  /** 1% over: short 10,000 of 1,010,000, past the 5,050 tolerance, so owed. */
  clearlyHigher: { price: 1_010 },
  /** 2% under: 20,000 over, which pays into the next day billed. */
  clearlyLower: { price: 980 },
} as const;
export type CloseKind = keyof typeof CLOSES;

export type { SeedDoc };
