/**
 * BPC Search's optional-column catalog and its device-local visible-columns
 * preference (issue #796) — the `Characters.tsx` table-view pattern
 * (`characterColumns.ts`), applied to a second table so it doesn't grow a
 * second column-picker mechanism.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const BPC_SEARCH_COLUMN_IDS = ['location', 'space'] as const;

export type BpcSearchColumnId = (typeof BPC_SEARCH_COLUMN_IDS)[number];

/** Location starts visible — it's the direct fix for the reported gap (owned rows showing "—"). Space starts hidden, per the ticket. */
export const DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS: readonly BpcSearchColumnId[] = ['location'];

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
