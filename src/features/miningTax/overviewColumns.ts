/**
 * The Mining Yield Overview table's column catalog and the device-local
 * preference behind it (issue #1282) — same shape as the Characters table
 * view's `characterColumns.ts`. Device-local for the same reason recorded
 * there (`docs/context/decisions/20260909-130638-…`): a phone and a desktop
 * reasonably want different columns.
 *
 * `date` is deliberately not one of these ids — it is the table's anchor
 * column and always shows, so it is never offered in the picker and never
 * stored in the preference.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const OVERVIEW_COLUMN_IDS = [
  'character',
  'system',
  'volume',
  'rawValue',
  'priceFormula',
  'refineValue',
  'oreBreakdown',
  'units',
  'pricing',
] as const;

export type OverviewColumnId = (typeof OVERVIEW_COLUMN_IDS)[number];

/** Everything the table already showed before this picker existed — the columns added since (Ore breakdown, Units, Price calculation) start off. */
export const DEFAULT_VISIBLE_OVERVIEW_COLUMNS: readonly OverviewColumnId[] = [
  'character',
  'system',
  'volume',
  'rawValue',
  'refineValue',
  'pricing',
];

function isOverviewColumnId(raw: unknown): raw is OverviewColumnId {
  return typeof raw === 'string' && (OVERVIEW_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_OVERVIEW_COLUMNS_KEY = 'miningYieldOverviewVisibleColumns';

export const useVisibleOverviewColumns = createLocalSetting<readonly OverviewColumnId[]>({
  key: VISIBLE_OVERVIEW_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_OVERVIEW_COLUMNS,
  // An empty stored array is rejected rather than honoured (characterColumns.ts
  // precedent) — it would render a table with only the date column and no
  // explanation.
  parse: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every(isOverviewColumnId)
      ? (raw as OverviewColumnId[])
      : null,
});

/**
 * `refineValue` only while the refining switch is on (issue #1281 — a column
 * for a value that isn't being computed would just show nothing), and
 * `character` only when there's more than one tracked character to
 * distinguish (the table already gates its own render on the same
 * condition).
 */
export function availableOverviewColumns(
  showRefining: boolean,
  showCharacterColumn: boolean
): readonly OverviewColumnId[] {
  return OVERVIEW_COLUMN_IDS.filter((id) => {
    if (id === 'refineValue' && !showRefining) return false;
    if (id === 'character' && !showCharacterColumn) return false;
    return true;
  });
}

/**
 * The stored preference, narrowed to what's actually offered right now — so
 * a column picked while refining/multi-character was on doesn't linger after
 * that condition goes away. The stored preference itself is untouched;
 * the column comes straight back once the condition returns.
 */
export function visibleAvailableColumns(
  visible: readonly OverviewColumnId[],
  showRefining: boolean,
  showCharacterColumn: boolean
): readonly OverviewColumnId[] {
  const available = new Set(availableOverviewColumns(showRefining, showCharacterColumn));
  return visible.filter((id) => available.has(id));
}
