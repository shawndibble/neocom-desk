/**
 * Corp roster's optional columns and device-local visible-columns preference.
 * `member` is not in the catalog: a roster that can lose the name column has
 * lost its rows.
 *
 * `roles` is the one column off by default (issue #1766): most Directors open
 * this page for the silences, and a Director who never asked for roles sees the
 * roster unchanged. A picker choice saved before it existed does not name it,
 * so it stays off there too.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CORP_ROSTER_COLUMN_IDS = ['lastSeen', 'ship', 'location', 'joined', 'roles'] as const;

export type CorpRosterColumnId = (typeof CORP_ROSTER_COLUMN_IDS)[number];

/** Shown until the pilot picks, and what "Reset to default" restores. */
export const CORP_ROSTER_DEFAULT_COLUMNS: readonly CorpRosterColumnId[] =
  CORP_ROSTER_COLUMN_IDS.filter((id) => id !== 'roles');

export const useVisibleCorpRosterColumns = createColumnVisibilitySetting({
  key: 'corpRosterVisibleColumns',
  ids: CORP_ROSTER_COLUMN_IDS,
  defaultVisible: CORP_ROSTER_DEFAULT_COLUMNS,
});
