import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import { allMembers, type DisplayRow } from './groupRows';

/**
 * How the Tax table reads each row — handed in by `TaxTab`, whose own cells
 * use the same functions, so an export cannot disagree with what is on
 * screen (a joined row's summed value, a dismissal's Payee label).
 */
export interface TaxCsvContext {
  /** An ore type's name, for the Ore column. */
  oreName: (typeId: number) => string;
  /** The row's system security status; undefined while the system is unread. */
  securityOf: (row: DisplayRow) => number | undefined;
  /** The row's date, or a joined row's date range. */
  dateLabel: (row: DisplayRow) => string;
  systemName: (row: DisplayRow) => string;
  /** Null for a row with no Assignment — the table's dash. */
  payeeName: (row: DisplayRow) => string | null;
  estimatedValue: (row: DisplayRow) => number;
  /** Null for a row with no Assignment — the table's dash, not a zero owed. */
  taxOwed: (row: DisplayRow) => number | null;
  /** A row's status as the table prints it, when it is not just the personal status (a Corp Tax Book state). */
  statusLabel?: (row: DisplayRow) => string | undefined;
}

/**
 * The rows an export holds: a combined (joined) row stands for several days'
 * Assignments, so it becomes one row per member — each with its own date,
 * ore, value, tax and status, and its group id in the Combined group column —
 * and the file's sums reconcile with the table's combined totals. Every other
 * row passes through untouched, so the result still sorts by the table's own
 * column sort values.
 */
export function expandCombinedRows(rows: readonly DisplayRow[]): DisplayRow[] {
  return rows.flatMap((dr) =>
    dr.groupMembers
      ? allMembers(dr).map(({ row, assignment }) => ({
          key: assignment.id,
          row,
          assignment,
          status: assignment.status,
          ...(dr.corp ? { corp: dr.corp } : {}),
        }))
      : [dr]
  );
}

const yesNo = (t: CsvTranslate, value: boolean) =>
  value ? t('miningTax.csvYes') : t('miningTax.csvNo');

/** Export columns for the Mining Tax table, in its column order (the select and edit columns carry no data). Feed it `expandCombinedRows`. */
export function taxCsvColumns(
  t: CsvTranslate,
  {
    oreName,
    securityOf,
    dateLabel,
    systemName,
    payeeName,
    estimatedValue,
    taxOwed,
    statusLabel,
  }: TaxCsvContext
): CsvColumn<DisplayRow>[] {
  return [
    { header: t('miningTax.characterColumn'), value: (dr) => dr.row.characterName },
    { header: t('miningTax.dateColumn'), value: dateLabel },
    { header: t('miningTax.systemColumn'), value: systemName },
    { header: t('miningTax.csvSecurity'), value: (dr) => securityOf(dr) ?? null },
    { header: t('miningTax.payeeColumn'), value: payeeName },
    { header: t('miningTax.labelColumn'), value: (dr) => dr.assignment?.label ?? null },
    {
      // Every type with its units, not only the icons the table has room for.
      header: t('miningTax.oreColumn'),
      value: (dr) =>
        (dr.assignment
          ? allMembers(dr).flatMap((m) => m.assignment.oreLines)
          : dr.row.unassignedOreLines
        )
          .map((line) => `${oreName(line.typeId)} ${line.quantity}`)
          .join('; ') || null,
    },
    { header: t('miningTax.estimatedValueColumn'), value: estimatedValue },
    { header: t('miningTax.taxOwedColumn'), value: taxOwed },
    {
      header: t('miningTax.statusColumn'),
      value: (dr) => statusLabel?.(dr) ?? t(`miningTax.status.${STATUS_LABEL_KEY[dr.status]}`),
    },
    {
      // Joined days share an id; blank on a row that was never joined.
      header: t('miningTax.csvCombinedGroup'),
      value: (dr) => dr.assignment?.groupId ?? null,
    },
    { header: t('miningTax.csvTaxPct'), value: (dr) => dr.assignment?.taxPct ?? null },
    {
      header: t('miningTax.csvNeedsReview'),
      value: (dr) => yesNo(t, dr.status === 'needs-review'),
    },
    {
      header: t('miningTax.csvCorpOverlap'),
      value: (dr) => (dr.corp?.kind === 'row' ? yesNo(t, Boolean(dr.corp.view.overlap)) : null),
    },
    {
      header: t('miningTax.csvCorrectedFrom'),
      value: (dr) => (dr.corp?.kind === 'row' ? (dr.corp.view.correction?.before ?? null) : null),
    },
  ];
}
