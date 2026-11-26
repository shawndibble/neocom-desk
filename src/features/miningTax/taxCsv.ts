import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import type { DisplayRow } from './groupRows';
import { oreLinesText } from './oreBreakdown';

export interface TaxCsvContext {
  oreName: (typeId: number) => string;
  securityOf: (row: DisplayRow) => number | undefined;
  dateLabel: (row: DisplayRow) => string;
  systemName: (row: DisplayRow) => string;
  payeeName: (row: DisplayRow) => string | null;
  estimatedValue: (row: DisplayRow) => number;
  taxOwed: (row: DisplayRow) => number | null;
  statusLabel?: (row: DisplayRow) => string | undefined;
}

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
      header: t('miningTax.csvCombinedEntry'),
      value: (dr) => dr.assignment?.groupId ?? null,
    },
    { header: t('miningTax.csvTaxPct'), value: (dr) => dr.assignment?.taxPct ?? null },
    {
      header: t('miningTax.csvNeedsReview'),
      value: (dr) =>
        exportFlag(
          t,
          dr.status === 'needs-review' &&
            !(dr.corp?.kind === 'row' && dr.corp.view.state === 'settling')
        ),
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
