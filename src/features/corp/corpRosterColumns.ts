import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CORP_ROSTER_COLUMN_IDS = ['lastSeen', 'ship', 'location', 'joined', 'roles'] as const;

export type CorpRosterColumnId = (typeof CORP_ROSTER_COLUMN_IDS)[number];

export const ROSTER_SORT = { columnId: 'lastSeen', direction: 'desc' } as const;

export const CORP_ROSTER_DEFAULT_COLUMNS: readonly CorpRosterColumnId[] =
  CORP_ROSTER_COLUMN_IDS.filter((id) => id !== 'roles');

export const useVisibleCorpRosterColumns = createColumnVisibilitySetting({
  key: 'corpRosterVisibleColumns',
  ids: CORP_ROSTER_COLUMN_IDS,
  defaultVisible: CORP_ROSTER_DEFAULT_COLUMNS,
});
