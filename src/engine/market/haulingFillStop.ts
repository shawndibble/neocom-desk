/**
 * When "Fill the free space" stops running batches. Each batch is a normal
 * Hauling scan of the next-best items; after it the caller sizes everything
 * found so far into the hold (`planFill`) and asks this whether to run
 * another. Pure.
 */
import type { TripPlan } from './haulingPlan';

/** Why a fill stopped. `stopped` is the user's Stop; `error` a failed batch. */
export type HaulingFillStopReason =
  'full' | 'nothing-left' | 'no-gain' | 'budget' | 'batch-cap' | 'stopped' | 'error';

/** Batches one press runs at most: each costs a scan's ESI budget. */
export const FILL_BATCH_CAP = 8;
const FULL_SHARE = 0.01;
const FULL_MIN_M3 = 50;

/** Free m³ at or under which the hold counts as full: 1% of it, never under 50 m³. */
export const fillFullAtM3 = (capacityM3: number): number =>
  Math.max(capacityM3 * FULL_SHARE, FULL_MIN_M3);

export interface FillBatchOutcome {
  /** Batches run since this press of Find (or Find more), this one included. */
  batchesThisRun: number;
  /** Rows the batch's scan returned. */
  batchRows: number;
  /** The scan's caps cut its shortlist: more may be left unlooked-at. */
  capped: boolean;
  /** Profitable fill lines from this batch's items in the plan of everything found. */
  newLines: number;
  /** Free m³ in every hold, and their capacity, once everything found is planned. */
  freeM3: number;
  capacityM3: number;
  /** That plan's binding limit. */
  binding: TripPlan['binding'];
}

/** The reason to stop after this batch, or null to run another. `stopped` and `error` are the caller's. */
export function haulingFillStop(
  o: FillBatchOutcome
): Exclude<HaulingFillStopReason, 'stopped' | 'error'> | null {
  if (o.freeM3 <= fillFullAtM3(o.capacityM3)) return 'full';
  if (o.binding === 'budget') return 'budget';
  if (o.batchRows === 0 && !o.capped) return 'nothing-left';
  if (o.newLines === 0) return 'no-gain';
  if (o.batchesThisRun >= FILL_BATCH_CAP) return 'batch-cap';
  return null;
}
