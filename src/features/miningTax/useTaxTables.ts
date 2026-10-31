import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableExport } from '@/components/ui/useTableExport';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useUrlSort } from '@/lib/useUrlState';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { statusColumnWidthClass } from '@/features/miningTax/statusColumnWidth';
import { expandCombinedRows } from '@/features/miningTax/groupRows';
import { taxCsvColumns } from '@/features/miningTax/taxCsv';
import { dateLabel, taxOwedOf } from '@/features/miningTax/taxRowFormat';
import { statusLabel, useTaxColumns } from '@/features/miningTax/useTaxColumns';
import { TAX_COLUMN_IDS, useVisibleTaxColumns } from './taxColumns';
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

  const { visible: visibleColumns } = useColumnVisibility(useVisibleTaxColumns, TAX_COLUMN_IDS);
  const { allColumns, openColumns, historyColumns } = useTaxColumns({
    ...columnInput,
    visibleColumns,
    showCharacterColumn,
    estimatedValueOf,
    systemName,
    payeeDisplayName,
    corpStateLabel,
    statusWidthClass,
  });

  // Validated against the columns shown: unticking the sorted one falls back to the default sort.
  const taxSort = useUrlSort(
    'tax.sort',
    TAX_DEFAULT_SORT,
    openColumns.map((c) => c.id)
  );
  const historySort = useUrlSort(
    'tax.historySort',
    TAX_DEFAULT_SORT,
    historyColumns.map((c) => c.id)
  );

  // The table's own cell helpers, so the export reads each row exactly as it
  // is shown.
  const csvColumns = useMemo(
    () =>
      taxCsvColumns(t, {
        oreName: (typeId) => columnInput.typeNames?.get(typeId) ?? `#${typeId}`,
        securityOf: (dr) => columnInput.systemSecurity?.get(dr.row.entry.solarSystemId),
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
    [
      t,
      columnInput.typeNames,
      columnInput.systemSecurity,
      systemName,
      payeeDisplayName,
      estimatedValueOf,
      corpStateLabel,
    ]
  );
  const baseExport = useTableExport({
    surface: 'mining-tax',
    rows: visibleRows,
    columns: csvColumns,
    // Open and History are two tables; the default reads only the mounted
    // Open one, so the file would drop every settled record.
    source: 'sorted-rows',
  });
  // Combined rows are split into their days when the export reads them, not on every render.
  const taxExport = useMemo(() => {
    const getRows = () => expandCombinedRows(baseExport.getRows());
    return {
      ...baseExport,
      getRows,
      tableProps: {
        ...baseExport.tableProps,
        exportable: { ...baseExport.tableProps.exportable, getRows },
      },
    };
  }, [baseExport]);

  return {
    showCharacterColumn,
    allColumns,
    openColumns,
    historyColumns,
    taxSort,
    historySort,
    taxExport,
  };
}
