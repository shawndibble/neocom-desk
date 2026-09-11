/**
 * BPC Search's optional-column catalog and its device-local visible-columns
 * preference (issue #796) — the `Characters.tsx` table-view pattern
 * (`characterColumns.ts`), applied to a second table so it doesn't grow a
 * second column-picker mechanism.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * In table column order — `columns` in `BpcSourcingPanel.tsx` renders exactly
 * this sequence, filtered to whichever ids are visible. `item` is not here:
 * it is the one column the table can never lose, so it is never optional.
 */
export const BPC_SEARCH_COLUMN_IDS = [
  'source',
  'location',
  'me',
  'te',
  'runs',
  'qty',
  'price',
  'region',
  'space',
  'expires',
] as const;

export type BpcSearchColumnId = (typeof BPC_SEARCH_COLUMN_IDS)[number];

/**
 * Location, ME, TE and Price are what a pilot needs to judge whether a copy
 * is worth buying — everything else (Source, Runs, Qty, Region, Expires)
 * starts hidden and is a toggle away via `ColumnPickerMenu`.
 */
export const DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS: readonly BpcSearchColumnId[] = [
  'location',
  'me',
  'te',
  'price',
];

function isBpcSearchColumnId(raw: unknown): raw is BpcSearchColumnId {
  return typeof raw === 'string' && (BPC_SEARCH_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_BPC_SEARCH_COLUMNS_KEY = 'bpcSearchVisibleColumns';

export const useVisibleBpcSearchColumns = createLocalSetting<readonly BpcSearchColumnId[]>({
  key: VISIBLE_BPC_SEARCH_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS,
  // An empty stored array is rejected rather than honoured, same as
  // `characterColumns.ts` — unlike there, an empty BPC Search column set is
  // less catastrophic (Item/ME/TE/etc. stay put), but still not a state
  // worth persisting silently.
  parse: (raw) =>
    Array.isArray(raw) && raw.every(isBpcSearchColumnId) ? (raw as BpcSearchColumnId[]) : null,
});
