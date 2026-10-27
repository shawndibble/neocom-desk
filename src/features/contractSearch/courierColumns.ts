/**
 * Contract Search's Courier board — optional-column catalog and device-local
 * visible-columns preference, the `bpcSearchColumns.ts` pattern applied here.
 * `route` is not in the catalog: like BPC Search's own identity column, it is
 * the one column `CourierResults.tsx`'s table can never lose.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const COURIER_COLUMN_IDS = [
  'reward',
  'collateral',
  'jumps',
  'iskPerJump',
  'iskPerVolume',
  'expires',
] as const;

export type CourierColumnId = (typeof COURIER_COLUMN_IDS)[number];

/** Every column shown today, so shipping the picker changes nothing on its own. */
export const DEFAULT_VISIBLE_COURIER_COLUMNS: readonly CourierColumnId[] = COURIER_COLUMN_IDS;

export const VISIBLE_COURIER_COLUMNS_KEY = 'courierVisibleColumns';

export const useVisibleCourierColumns = createColumnVisibilitySetting({
  key: VISIBLE_COURIER_COLUMNS_KEY,
  ids: COURIER_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_COURIER_COLUMNS,
});
