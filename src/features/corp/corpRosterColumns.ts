/**
 * Corp roster's optional columns and device-local visible-columns preference.
 * `member` is not in the catalog: a roster that can lose the name column has
 * lost its rows.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CORP_ROSTER_COLUMN_IDS = ['lastSeen', 'ship', 'location', 'joined'] as const;

export type CorpRosterColumnId = (typeof CORP_ROSTER_COLUMN_IDS)[number];

export const useVisibleCorpRosterColumns = createColumnVisibilitySetting({
  key: 'corpRosterVisibleColumns',
  ids: CORP_ROSTER_COLUMN_IDS,
});
