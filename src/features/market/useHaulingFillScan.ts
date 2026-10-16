/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub (#3878); the slice that implements this file removes it */
/**
 * The on-demand scan behind "Fill the free space" (issue #3878): the same
 * Hauling Opportunities scan as `useHaulingScan`, over the type ids of every
 * other Hauling category on the lane, run only once `enabled` turns true (the
 * user asked) and never when the category is already Everything.
 *
 * CONTRACT STUB — implemented in slice S1.
 */
import type { HaulMode } from './haulingData';
import type { HaulingEnd } from './haulingHubs';
import type { HaulingScanState } from './useHaulingScan';

export type HaulingFillScanState = { status: 'idle' } | HaulingScanState;

export function useHaulingFillScan(
  _from: HaulingEnd,
  _to: HaulingEnd,
  _categoryId: number,
  _mode: HaulMode,
  _enabled: boolean
): { state: HaulingFillScanState; refresh: () => void } {
  return { state: { status: 'idle' }, refresh: () => {} };
}
