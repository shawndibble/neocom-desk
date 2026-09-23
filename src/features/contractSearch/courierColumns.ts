/**
 * Contract Search's Courier board — optional-column catalog and device-local
 * visible-columns preference, the `bpcSearchColumns.ts` pattern applied here.
 * `route` is not in the catalog: like BPC Search's own identity column, it is
 * the one column `CourierResults.tsx`'s table can never lose.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

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

function isCourierColumnId(raw: unknown): raw is CourierColumnId {
  return typeof raw === 'string' && (COURIER_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_COURIER_COLUMNS_KEY = 'courierVisibleColumns';

export const useVisibleCourierColumns = createLocalSetting<readonly CourierColumnId[]>({
  key: VISIBLE_COURIER_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_COURIER_COLUMNS,
  parse: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every(isCourierColumnId)
      ? (raw as CourierColumnId[])
      : null,
});
