import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterChip,
  RowActionsMenu,
  type DataTableColumn,
} from '@/components/ui';
import { useTableExport } from '@/components/ui/useTableExport';
import type { useColumnVisibility } from '@/lib/columnVisibility';
import type { useUrlSort } from '@/lib/useUrlState';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { Contract } from '@/esi/endpoints';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { CONTRACT_STATUS_KEY } from '@/features/character/contractLabels';
import {
  EMPTY_CONTRACTS_FILTER,
  isContractsFilterActive,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import { ContractDayHeader } from './ContractCells';
import { ContractsFilterBar } from './ContractsFilterBar';
import { CONTRACTS_HISTORY_COLUMN_IDS, type ContractsHistoryColumnId } from './contractsColumns';

/** Module-level so the table's windowing and row memo see one stable function. */
const contractRowKey = (contract: Contract) => contract.contract_id;

interface Props {
  filter: ContractsFilter;
  onFilterChange: (next: ContractsFilter) => void;
  statusOptions: Contract['status'][];
  typeOptions: Contract['type'][];
  rows: readonly Contract[];
  columns: DataTableColumn<Contract>[];
  optionalColumns: Record<ContractsHistoryColumnId, DataTableColumn<Contract>>;
  columnVisibility: ReturnType<typeof useColumnVisibility<ContractsHistoryColumnId>>;
  tableExport: ReturnType<typeof useTableExport<Contract>>;
  sortProps: ReturnType<typeof useUrlSort>;
  highlightedContractId: number | null;
  /** The notices above the filter bar (cache age, truncation). */
  notices: ReactNode;
}

/** The History tab's filter bar, phone status chips and contracts table. */
export function ContractsHistoryTable({
  filter,
  onFilterChange,
  statusOptions,
  typeOptions,
  rows,
  columns,
  optionalColumns,
  columnVisibility,
  tableExport,
  sortProps,
  highlightedContractId,
  notices,
}: Props) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return (
    <>
      {notices}
      <ContractsFilterBar
        filter={filter}
        onChange={onFilterChange}
        statusOptions={statusOptions}
        typeOptions={typeOptions}
        actions={
          <ColumnPickerMenu
            available={CONTRACTS_HISTORY_COLUMN_IDS}
            visible={columnVisibility.visible}
            columnsById={optionalColumns}
            onToggle={columnVisibility.toggle}
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            onReset={columnVisibility.reset}
            resetLabel={t('common.resetColumns')}
          />
        }
      />
      {/* Phone only: the filter sheet's status chips, one tap away. */}
      <div
        role="group"
        aria-label={t('contracts.statusFilterLabel')}
        className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2 sm:hidden"
      >
        <FilterChip
          label={t('contracts.statusAll')}
          selected={filter.status === null}
          onToggle={() => onFilterChange({ ...filter, status: null })}
        />
        {statusOptions.map((status) => (
          <FilterChip
            key={status}
            label={t(CONTRACT_STATUS_KEY[status])}
            selected={filter.status === status}
            onToggle={() =>
              onFilterChange({ ...filter, status: filter.status === status ? null : status })
            }
          />
        ))}
      </div>
      {rows.length === 0 ? (
        // Zero matches with no active filter can't happen today (an empty
        // list is caught above), but the reset only belongs where a filter is on.
        isContractsFilterActive(filter) ? (
          <EmptyState
            title={t('contracts.noFilterMatches')}
            hint={t('contracts.noFilterMatchesResetHint')}
            className="py-8"
            action={
              <Button size="sm" onClick={() => onFilterChange(EMPTY_CONTRACTS_FILTER)}>
                {t('common.resetFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('contracts.noFilterMatches')}
            hint={t('contracts.noFilterMatchesHint')}
            className="py-8"
          />
        )
      ) : (
        <div className="relative overflow-x-auto">
          {/* The desktop table can be wider than the content column beside the
            nav rail (#3960): it scrolls inside this wrapper, never the page.
            `relative` keeps the cells' absolutely positioned `sr-only` text
            (the price's full ISK) inside the clip too, or its containing
            block resolves above the wrapper and still widens the page. */}
          <DataTable
            {...tableExport.tableProps}
            label={t('contracts.title')}
            columns={columns}
            rows={rows}
            rowKey={contractRowKey}
            virtualize="auto"
            rowMoreActions
            rowContextMenu={(contract, tr) => (
              <RowActionsMenu
                name={`${t('contractDetail.contractIdLabel')} ${contract.contract_id}`}
                items={<OpenInEveMenuItem kind="contract" id={contract.contract_id} />}
              >
                {tr}
              </RowActionsMenu>
            )}
            highlightRowKey={highlightedContractId}
            {...sortProps}
            stackLayout="dense"
            // Issue days are sections on a phone, not folded duplicates:
            // open, with members in line with the cards above them.
            className="dt-flat-groups"
            groupBy={{
              key: (contract) => formatDateOnly(new Date(contract.date_issued), timeZone),
              minSize: 1,
              defaultExpanded: () => true,
              renderHeader: (group) => (
                <ContractDayHeader
                  date={formatDateOnly(new Date(group[0].date_issued), timeZone)}
                  count={group.length}
                  timeZone={timeZone}
                />
              ),
            }}
          />
        </div>
      )}
    </>
  );
}
