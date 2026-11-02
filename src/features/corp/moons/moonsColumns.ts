/**
 * Device-local visible-columns preferences for the Corp Tax Book's Statements
 * and Miners tables. Period and Miner (each table's identity column) are not
 * in the catalogs: a table that can lose the column naming its rows has lost
 * its rows.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const STATEMENTS_COLUMN_IDS = [
  'status',
  'miners',
  'billed',
  'paid',
  'outstanding',
  'mailed',
  'due',
  'issued',
] as const;

export type StatementsColumnId = (typeof STATEMENTS_COLUMN_IDS)[number];

export const useVisibleStatementsColumns = createColumnVisibilitySetting({
  key: 'corpMoonsStatementsVisibleColumns',
  ids: STATEMENTS_COLUMN_IDS,
  // Period alone is a fair table: honour a pick of nothing instead of restoring everything on reload.
  allowEmpty: true,
});

export const MINERS_COLUMN_IDS = [
  'standing',
  'owed',
  'overdue',
  'unbilled',
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
