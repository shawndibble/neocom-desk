import type { TripPlan } from './haulingPlan';

export type HaulingFillStopReason =
  'full' | 'nothing-left' | 'no-gain' | 'budget' | 'batch-cap' | 'stopped';

export const FILL_BATCH_CAP = 8;
const FULL_SHARE = 0.01;
const FULL_MIN_M3 = 50;

export const fillFullAtM3 = (capacityM3: number): number =>
  Math.max(capacityM3 * FULL_SHARE, FULL_MIN_M3);

export interface FillRoom {
  freeM3: number;
  capacityM3: number;
  binding: TripPlan['binding'];
}

export interface FillBatchOutcome extends FillRoom {
  batchInPress: number;
  batchRows: number;
  capped: boolean;
  newLines: number;
}

export function haulingFillStop(
  outcome: FillBatchOutcome
): Exclude<HaulingFillStopReason, 'stopped'> | null {
  if (outcome.freeM3 <= fillFullAtM3(outcome.capacityM3)) return 'full';
  if (outcome.binding === 'budget') return 'budget';
  if (outcome.batchRows === 0 && !outcome.capped) return 'nothing-left';
  if (outcome.batchRows > 0 && outcome.newLines === 0) return 'no-gain';
  if (outcome.batchInPress >= FILL_BATCH_CAP) return 'batch-cap';
  return null;
}

export function fillCanFindMore(room: FillRoom & { reason: HaulingFillStopReason }): boolean {
  return (
    room.reason !== 'nothing-left' &&
    room.binding !== 'budget' &&
    room.freeM3 > fillFullAtM3(room.capacityM3)
  );
}
