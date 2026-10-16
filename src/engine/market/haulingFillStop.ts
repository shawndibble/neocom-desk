/**
 * When "Fill the free space" stops running batches. Each batch is a normal
 * Hauling scan of the next-best items; after it the caller sizes everything
 * found so far into the hold (`planFill`) and asks this whether to run
 * another. Pure.
 */
import type { TripPlan } from './haulingPlan';

/** Why a fill stopped. `stopped` is the user's Stop. A failed batch is a status, not a reason. */
export type HaulingFillStopReason =
  'full' | 'nothing-left' | 'no-gain' | 'budget' | 'batch-cap' | 'stopped';

/** Batches one press runs at most: each costs a scan's ESI budget. */
export const FILL_BATCH_CAP = 8;
const FULL_SHARE = 0.01;
const FULL_MIN_M3 = 50;

/** Free m³ at or under which the hold counts as full: 1% of it, never under 50 m³. */
export const fillFullAtM3 = (capacityM3: number): number =>
  Math.max(capacityM3 * FULL_SHARE, FULL_MIN_M3);

/** The hold once everything found is planned. */
export interface FillRoom {
  /** Free m³ in every hold, and their capacity. */
  freeM3: number;
  capacityM3: number;
  /** That plan's binding limit. */
  binding: TripPlan['binding'];
}

export interface FillBatchOutcome extends FillRoom {
  /** Batches run since this press of Find (or Find more), this one included. */
  batchInPress: number;
  /** Rows the batch's scan returned that pass the user's filters. */
  batchRows: number;
  /** The scan's caps cut its shortlist: more may be left unlooked-at. */
  capped: boolean;
  /** Profitable fill lines from this batch's rows in the plan of everything found. */
  newLines: number;
}

/** The reason to stop after this batch, or null to run another. `stopped` is the caller's. */
export function haulingFillStop(
  outcome: FillBatchOutcome
): Exclude<HaulingFillStopReason, 'stopped'> | null {
  if (outcome.freeM3 <= fillFullAtM3(outcome.capacityM3)) return 'full';
  if (outcome.binding === 'budget') return 'budget';
  if (outcome.batchRows === 0 && !outcome.capped) return 'nothing-left';
  // An empty batch cut short has nothing to judge: the next one scans further.
  if (outcome.batchRows > 0 && outcome.newLines === 0) return 'no-gain';
  if (outcome.batchInPress >= FILL_BATCH_CAP) return 'batch-cap';
  return null;
}

/**
 * Whether Find more can add anything after a stop: room left, something left
 * to scan, and the plan not held by Max spend (raising it moves the binding).
 */
export function fillCanFindMore(room: FillRoom & { reason: HaulingFillStopReason }): boolean {
  return (
    room.reason !== 'nothing-left' &&
    room.binding !== 'budget' &&
    room.freeM3 > fillFullAtM3(room.capacityM3)
  );
}
