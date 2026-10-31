import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import type { DisplayRow } from './groupRows';
import { oreLinesText } from './oreBreakdown';

/**
 * How the Tax table reads each row — handed in by `TaxTab`, whose own cells
 * use the same functions, so an export cannot disagree with what is on
 * screen (a dismissal's Payee label, a Corp Tax Book state).
 */
export interface TaxCsvContext {
  /** An ore type's name, for the Ore column. */
  oreName: (typeId: number) => string;
  /** The row's system security status; undefined while the system is unread. */
  securityOf: (row: DisplayRow) => number | undefined;
  /** The row's date. */
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

/** Export columns for the Mining Tax table, in its column order (the select and edit columns carry no data). Feed it rows from `expandCombinedRows`. */
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
      value: (dr) => oreLinesText(dr.assignment?.oreLines ?? dr.row.unassignedOreLines, oreName),
    },
    { header: t('miningTax.estimatedValueColumn'), value: estimatedValue },
    { header: t('miningTax.taxOwedColumn'), value: taxOwed },
    {
      header: t('miningTax.statusColumn'),
      value: (dr) => statusLabel?.(dr) ?? t(`miningTax.status.${STATUS_LABEL_KEY[dr.status]}`),
    },
    {
      // Joined days share an id; blank on a row that was never joined.
      header: t('miningTax.csvCombinedEntry'),
      value: (dr) => dr.assignment?.groupId ?? null,
    },
    { header: t('miningTax.csvTaxPct'), value: (dr) => dr.assignment?.taxPct ?? null },
    {
      header: t('miningTax.csvNeedsReview'),
      value: (dr) => exportFlag(t, dr.status === 'needs-review'),
    },
    {
      header: t('miningTax.csvCorpOverlap'),
      value: (dr) =>
        dr.corp?.kind === 'row' ? exportFlag(t, Boolean(dr.corp.view.overlap)) : null,
    },
    {
      header: t('miningTax.csvCorrectedFrom'),
      value: (dr) => (dr.corp?.kind === 'row' ? (dr.corp.view.correction?.before ?? null) : null),
    },
  ];
}
