/**
 * The officer Pending table's optional columns and device-local visible-columns
 * preference. The tick box, Pilot, Amount and the actions are not in the
 * catalog: they are what a claim is decided on.
 *
 * Lost and Fleet or FC start off (issue #5701), so the table fits at 1024 with
 * Approve and Reject in view; the claim detail shows both. An officer who
 * ticks them back on chooses the wider table.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const PENDING_COLUMN_IDS = ['hull', 'lost', 'fleet'] as const;

export type PendingColumnId = (typeof PENDING_COLUMN_IDS)[number];

/** Shown until the officer picks, and what "Reset to default" restores. */
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
