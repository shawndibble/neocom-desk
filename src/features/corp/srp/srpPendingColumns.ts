import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const PENDING_COLUMN_IDS = ['hull', 'lost', 'fleet'] as const;

export type PendingColumnId = (typeof PENDING_COLUMN_IDS)[number];

export const PENDING_DEFAULT_COLUMNS: readonly PendingColumnId[] = ['hull'];

export const useVisiblePendingColumns = createColumnVisibilitySetting({
  key: 'srpPendingVisibleColumns',
  ids: PENDING_COLUMN_IDS,
  defaultVisible: PENDING_DEFAULT_COLUMNS,
  allowEmpty: true,
});

export function isPendingColumnId(id: string): id is PendingColumnId {
  return (PENDING_COLUMN_IDS as readonly string[]).includes(id);
}
