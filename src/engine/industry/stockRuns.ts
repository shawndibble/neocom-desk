/**
 * The most runs a Build Plan's owned stock covers: the largest whole number of
 * runs for which every material row's need is within what the pilot may draw
 * on. Stock-sized batches for a returning industrialist: "what can I build
 * from what is in the hangar".
 *
 * Pure, and store-agnostic like `ownedStockOffer.ts`: the caller says what a
 * run count needs (`rowsAt`, the engine's own materials calculation, so ME
 * rounding is never re-derived here) and what each type has free
 * (`availableFor`, the Owned-Stock Offer's quantity: scoped stock less any
 * Group Stock Claim ahead of the plan).
 */

import { MAX_JOB_RUNS } from './types';

/** A material row's need at one run count. */
export interface StockRunsRow {
  typeID: number;
  quantity: number;
}

export interface MaxRunsFromStockInput {
  /** The plan's material rows when run `runs` times. */
  rowsAt: (runs: number) => readonly StockRunsRow[];
  /** What a type has free to draw on; the Owned-Stock Offer's quantity. */
  availableFor: (typeID: number) => number;
  /** Largest run count to try; defaults to the plan maximum. */
  maxRuns?: number;
}

export interface MaxRunsFromStock {
  /** Whole runs every row is covered for; 0 when not even one run is. */
  runs: number;
  /** The row that caps `runs`, short at `runs + 1` (at 1 when `runs` is 0); null at the cap or with no rows. */
  limiting: number | null;
}

/**
 * Runs at which a row is short, first in row order; `undefined` when none is.
 * Monotonic in runs (more runs never need less), so the largest covered run
 * count is found by doubling then bisecting rather than solving anything.
 */
function firstShortRow(
  rows: readonly StockRunsRow[],
  availableFor: (typeID: number) => number
): number | undefined {
  return rows.find(({ typeID, quantity }) => quantity > availableFor(typeID))?.typeID;
}

export function maxRunsFromStock({
  rowsAt,
  availableFor,
  maxRuns = MAX_JOB_RUNS,
}: MaxRunsFromStockInput): MaxRunsFromStock {
  const cap = Math.max(1, Math.floor(maxRuns));
  const shortAt = (runs: number) => firstShortRow(rowsAt(runs), availableFor);

  if (rowsAt(1).length === 0) return { runs: 0, limiting: null };
  const shortAtOne = shortAt(1);
  if (shortAtOne !== undefined) return { runs: 0, limiting: shortAtOne };

  let covered = 1;
  let short: number | undefined;
  let beyond = 1;
  // Double until a count is short or the cap is covered.
  while (covered < cap) {
    beyond = Math.min(covered * 2, cap);
    short = shortAt(beyond);
    if (short !== undefined) break;
    covered = beyond;
  }
  if (covered >= cap) return { runs: cap, limiting: null };

  // `covered` holds, `beyond` is short; bisect to the boundary.
  while (beyond - covered > 1) {
    const mid = Math.floor((covered + beyond) / 2);
    const midShort = shortAt(mid);
    if (midShort === undefined) covered = mid;
    else {
      beyond = mid;
      short = midShort;
    }
  }
  return { runs: covered, limiting: short ?? null };
}
