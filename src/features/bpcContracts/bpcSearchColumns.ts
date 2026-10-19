/**
 * BPC Search's optional-column catalog and its device-local visible-columns
 * preference (issue #796) — the `Characters.tsx` table-view pattern
 * (`characterColumns.ts`), applied to a second table so it doesn't grow a
 * second column-picker mechanism.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

/**
 * In table column order — `columns` in `BpcSourcingPanel.tsx` renders exactly
 * this sequence, filtered to whichever ids are visible. `item` is not here:
 * it is the one column the table can never lose, so it is never optional.
 */
export const BPC_SEARCH_COLUMN_IDS = [
  'source',
  'location',
  'jumps',
  'me',
  'te',
  'runs',
  'qty',
  'iskPerRun',
  'price',
  'region',
  'space',
  'expires',
] as const;

export type BpcSearchColumnId = (typeof BPC_SEARCH_COLUMN_IDS)[number];

/**
 * Location, Jumps, ME, TE and Price are what a pilot needs to judge whether a
 * copy is worth buying and worth the trip — everything else (Source, Runs,
 * Qty, ISK/run, Region, Space, Expires) starts hidden and is a toggle away
 * via `ColumnPickerMenu`. ISK/run
 * sits after Runs and Qty, the two counts it divides by — the same placement
 * ISK/jump takes after Jumps on the Courier board: a rate shown without its
 * denominator states less than they do together.
 */
export const DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS: readonly BpcSearchColumnId[] = [
  'location',
  'jumps',
  'me',
  'te',
  'price',
];

export const VISIBLE_BPC_SEARCH_COLUMNS_KEY = 'bpcSearchVisibleColumns.v2';

// Empty stays valid here: Item/ME/TE/etc. stay put, unlike `characterColumns.ts`.
export const useVisibleBpcSearchColumns = createColumnVisibilitySetting({
  key: VISIBLE_BPC_SEARCH_COLUMNS_KEY,
  ids: BPC_SEARCH_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS,
  allowEmpty: true,
});
