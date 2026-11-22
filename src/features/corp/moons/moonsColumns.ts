/**
 * Device-local visible-columns preferences for the Corp Tax Book's Miners
 * table. Miner (the table's identity column) is not
 * in the catalog: a table that can lose the column naming its rows has lost
 * its rows.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const MINERS_COLUMN_IDS = [
  'standing',
  'owed',
  'overdue',
  'account',
  'credit',
  'paid',
] as const;

export type MinersColumnId = (typeof MINERS_COLUMN_IDS)[number];

/** Starts unticked on a phone: the compact default `credit` had as `phoneHidden`. */
export const MINERS_PHONE_OFF: readonly MinersColumnId[] = ['credit'];

/** Starts unticked in a table pane between the narrow-table and card widths: only the columns that fit. */
export const MINERS_NARROW_OFF: readonly MinersColumnId[] = ['standing', 'credit'];

/** Below this pane width (rem) the Miners table shows as cards; the five core columns fit above it. */
export const MINERS_CARDS_BELOW_REM = 40;

export const useVisibleMinersColumns = createColumnVisibilitySetting({
  key: 'corpMoonsMinersVisibleColumns',
  ids: MINERS_COLUMN_IDS,
  allowEmpty: true,
});
