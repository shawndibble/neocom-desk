import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableExport } from '@/components/ui/useTableExport';
import { useUrlSort } from '@/lib/useUrlState';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { statusColumnWidthClass } from '@/features/miningTax/statusColumnWidth';
import { taxCsvColumns } from '@/features/miningTax/taxCsv';
import { dateLabel, taxOwedOf } from '@/features/miningTax/taxRowFormat';
import { statusLabel, useTaxColumns } from '@/features/miningTax/useTaxColumns';
import { TAX_DEFAULT_SORT } from './useTaxUrlFilters';

type TaxColumnsInput = Parameters<typeof useTaxColumns>[0];

interface Args extends Pick<
  TaxColumnsInput,
  | 'isPhone'
  | 'showOreColumn'
  | 'showValueColumn'
  | 'showSelectColumn'
  | 'typeNames'
  | 'systemSecurity'
  | 'selection'
  | 'expandedCombined'
  | 'toggleRowSelected'
  | 'toggleCombinedExpanded'
  | 'estimatedValueOf'
  | 'systemName'
  | 'payeeDisplayName'
  | 'corpStateLabel'
> {
  visibleRows: readonly DisplayRow[];
}

/** The Open and History tables' columns, URL-held sorts, and the CSV export that reads rows as they are shown. */
export function useTaxTables({
  visibleRows,
  corpStateLabel,
  estimatedValueOf,
  systemName,
  payeeDisplayName,
  ...columnInput
}: Args) {
  const { t } = useTranslation();

  // Only when the rows in view actually come from more than one pilot: a
  // single-miner ledger repeating the same name on every line is width the
  // Payee column needs (decision 20261004, "room for long Payee names").
  const showCharacterColumn = new Set(visibleRows.map((dr) => dr.row.characterId)).size > 1;

  // Sized to the longest status on screen, over both tables so Open's and
  // History's columns still line up.
  const statusWidthClass = useMemo(
    () =>
      statusColumnWidthClass(
        visibleRows.map((dr) => ({
          text: dr.corp ? corpStateLabel(dr.corp) : statusLabel(t, dr.status),
          marked: dr.corp?.kind === 'row' && Boolean(dr.corp.view.overlap),
        }))
      ),
    [visibleRows, corpStateLabel, t]
  );

  const { baseColumns, openColumns, historyColumns } = useTaxColumns({
    ...columnInput,
    showCharacterColumn,
    estimatedValueOf,
    systemName,
    payeeDisplayName,
    corpStateLabel,
    statusWidthClass,
  });

  const taxSort = useUrlSort(
    'tax.sort',
    TAX_DEFAULT_SORT,
    openColumns.map((c) => c.id)
  );
  const historySort = useUrlSort(
    'tax.historySort',
    TAX_DEFAULT_SORT,
    baseColumns.map((c) => c.id)
  );

  // The table's own cell helpers, so the export reads each row exactly as it
  // is shown.
  const csvColumns = useMemo(
    () =>
      taxCsvColumns(t, {
        showCharacter: showCharacterColumn,
        dateLabel,
        systemName,
        payeeName: (dr) => (dr.assignment ? payeeDisplayName(dr) : null),
        estimatedValue: estimatedValueOf,
        taxOwed: (dr) =>
          dr.assignment && !(dr.corp?.kind === 'row' && dr.corp.view.taxOwed === null)
            ? taxOwedOf(dr)
            : null,
        statusLabel: (dr) => (dr.corp ? corpStateLabel(dr.corp) : undefined),
      }),
    [t, showCharacterColumn, systemName, payeeDisplayName, estimatedValueOf, corpStateLabel]
  );
  const taxExport = useTableExport({
    surface: 'mining-tax',
    rows: visibleRows,
    columns: csvColumns,
    // Open and History are two tables; the default reads only the mounted
    // Open one, so the file would drop every settled record.
    source: 'sorted-rows',
  });

  return { showCharacterColumn, openColumns, historyColumns, taxSort, historySort, taxExport };
}
