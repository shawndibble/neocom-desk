import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import type { DisplayRow } from './groupRows';

/**
 * How the Tax table reads each row — handed in by `TaxTab`, whose own cells
 * use the same functions, so an export cannot disagree with what is on
 * screen (a joined row's summed value, a dismissal's Payee label).
 */
export interface TaxCsvContext {
  /** Same gate as the table's Character column: more than one tracked character. */
  showCharacter: boolean;
  /** The row's date, or a joined row's date range. */
  dateLabel: (row: DisplayRow) => string;
  systemName: (row: DisplayRow) => string;
  /** Null for a row with no Assignment — the table's dash. */
  payeeName: (row: DisplayRow) => string | null;
  estimatedValue: (row: DisplayRow) => number;
  /** Null for a row with no Assignment — the table's dash, not a zero owed. */
  taxOwed: (row: DisplayRow) => number | null;
}

/** Export columns for the Mining Tax table, in its column order (the select and edit columns carry no data). */
export function taxCsvColumns(
  t: CsvTranslate,
  { showCharacter, dateLabel, systemName, payeeName, estimatedValue, taxOwed }: TaxCsvContext
): CsvColumn<DisplayRow>[] {
  const columns: CsvColumn<DisplayRow>[] = [];
  if (showCharacter) {
    columns.push({ header: t('miningTax.characterColumn'), value: (dr) => dr.row.characterName });
  }
  columns.push(
    { header: t('miningTax.dateColumn'), value: dateLabel },
    { header: t('miningTax.systemColumn'), value: systemName },
    { header: t('miningTax.payeeColumn'), value: payeeName },
    { header: t('miningTax.estimatedValueColumn'), value: estimatedValue },
    { header: t('miningTax.taxOwedColumn'), value: taxOwed },
    {
      header: t('miningTax.statusColumn'),
      value: (dr) => t(`miningTax.status.${STATUS_LABEL_KEY[dr.status]}`),
    }
  );
  return columns;
}
