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

export const DEFAULT_VISIBLE_COURIER_COLUMNS: readonly CourierColumnId[] = COURIER_COLUMN_IDS;

export const VISIBLE_COURIER_COLUMNS_KEY = 'courierVisibleColumns';

export const useVisibleCourierColumns = createColumnVisibilitySetting({
  key: VISIBLE_COURIER_COLUMNS_KEY,
  ids: COURIER_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_COURIER_COLUMNS,
});
