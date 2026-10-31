import { useTranslation } from 'react-i18next';
import { DataTable, DataTableSortPicker, Panel, type DataTableColumn } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { PayeeRecord } from '@/db';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import type { HistoryMonth } from '@/features/miningTax/ledgerSections';
import type { TrackedCharacter } from '@/features/miningTax/snapshot';
import { dateRangeOf, taxOwedOf } from '@/features/miningTax/taxRowFormat';
import type { useUrlSort } from '@/lib/useUrlState';
import { HistoryMonthHeader } from './HistoryMonthHeader';
import { TaxColumnPicker } from './TaxColumnPicker';
import { PayeeFilterMenu } from './PayeeFilterMenu';
import type { PayeeFilter } from './payeeFilter';
import type { TaxRowProps } from './useTaxRowInteractions';

type UrlSortState = ReturnType<typeof useUrlSort>;

interface TaxOpenLedgerProps {
  ledgerPayees: readonly PayeeRecord[];
  characters: readonly TrackedCharacter[];
  resolvedPayeeFilter: PayeeFilter;
  onPayeeFilterChange: (next: PayeeFilter) => void;
  onTogglePayee: (payeeId: string) => void;
  isPhone: boolean;
  visibleRows: readonly DisplayRow[];
  openRows: DisplayRow[];
  openColumns: DataTableColumn<DisplayRow>[];
  /** Every column on offer, ticked or not: what the picker lists. */
  allColumns: DataTableColumn<DisplayRow>[];
  taxSort: UrlSortState;
  taxExport: UseTableExport<DisplayRow>;
  rowProps: TaxRowProps;
}

/**
 * The filters sit right on top of the Open list they filter first: no
 * "Open" heading between them, since every row in it already carries its status.
 */
export function TaxOpenLedger({
  ledgerPayees,
  characters,
  resolvedPayeeFilter,
  onPayeeFilterChange,
  onTogglePayee,
  isPhone,
  visibleRows,
  openRows,
  openColumns,
  allColumns,
  taxSort,
  taxExport,
  rowProps,
}: TaxOpenLedgerProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {ledgerPayees.length > 0 && (
          <PayeeFilterMenu
            ledgerPayees={ledgerPayees}
            characters={characters}
            resolvedPayeeFilter={resolvedPayeeFilter}
            onChange={onPayeeFilterChange}
            onTogglePayee={onTogglePayee}
          />
        )}

        {/* On a phone the stacked cards have no header row to sort
        from; the picker lives here rather than above the list. */}
        {isPhone && openRows.length > 1 && (
          <DataTableSortPicker
            columns={openColumns}
            rows={openRows}
            sort={taxSort.sort}
            onSortChange={taxSort.onSortChange}
            size="sm"
          />
        )}

        {visibleRows.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1">
            <TaxColumnPicker columns={allColumns} />
            <TableActionsMenu name={t('miningTax.title')} tableExport={taxExport} />
          </span>
        )}
      </div>

      {/* An empty ledger is EmptyState's to explain below; "nothing
      open — every entry is paid" would contradict it. */}
      {visibleRows.length > 0 && (
        <section aria-labelledby="mining-tax-open">
          <h2 id="mining-tax-open" className="sr-only">
            {t('miningTax.sections.open', { count: openRows.length })}
          </h2>
          {openRows.length === 0 ? (
            <p className="rounded-xs border border-dashed border-line px-3 py-3 text-xs text-text-dim">
              {t('miningTax.sections.openEmpty')}
            </p>
          ) : (
            <Panel padded={false}>
              <div className="overflow-x-auto">
                <DataTable
                  {...taxExport.tableProps}
                  columns={openColumns}
                  rows={openRows}
                  className="dt-dense-lead dt-actions-pinned-only sm:table-fixed"
                  rowKey={(dr) => dr.key}
                  label={t('miningTax.sections.openLabel')}
                  {...taxSort}
                  stackLayout="dense"
                  {...rowProps}
                />
              </div>
            </Panel>
          )}
        </section>
      )}
    </div>
  );
}

interface TaxHistoryLedgerProps {
  historyRows: DisplayRow[];
  history: HistoryMonth[];
  historyColumns: DataTableColumn<DisplayRow>[];
  historySort: UrlSortState;
  rowProps: TaxRowProps;
}

/** Everything settled, a month to a fold. */
export function TaxHistoryLedger({
  historyRows,
  history,
  historyColumns,
  historySort,
  rowProps,
}: TaxHistoryLedgerProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="mining-tax-history" className="space-y-2">
      <h2 id="mining-tax-history" className={eyebrowClassName}>
        {t('miningTax.sections.history')}
      </h2>
      <Panel padded={false}>
        <div className="overflow-x-auto">
          <DataTable
            columns={historyColumns}
            rows={historyRows}
            // Months are sections here, not folded duplicates:
            // their entries line up with Open's, unindented.
            className="dt-flat-groups dt-actions-pinned-only sm:table-fixed"
            rowKey={(dr) => dr.key}
            label={t('miningTax.sections.history')}
            {...historySort}
            stackLayout="dense"
            {...rowProps}
            groupBy={{
              key: (dr) => (dateRangeOf(dr).at(-1) ?? dr.row.entry.date).slice(0, 7),
              allWidths: true,
              minSize: 1,
              // The newest month opens; older ones stay folded.
              defaultExpanded: (rows) =>
                (dateRangeOf(rows[0]).at(-1) ?? '').slice(0, 7) === history[0]?.month,
              renderHeader: (rows) => (
                <HistoryMonthHeader
                  month={(dateRangeOf(rows[0]).at(-1) ?? '').slice(0, 7)}
                  count={rows.length}
                  taxTotal={rows.reduce((sum, dr) => sum + (dr.assignment ? taxOwedOf(dr) : 0), 0)}
                />
              ),
            }}
          />
        </div>
      </Panel>
    </section>
  );
}
