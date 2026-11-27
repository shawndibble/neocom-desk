import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  type DataTableColumn,
} from '@/components/ui';
import { useTableExport } from '@/components/ui/useTableExport';
import type { useColumnVisibility } from '@/lib/columnVisibility';
import type { useUrlSort } from '@/lib/useUrlState';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { Contract } from '@/esi/endpoints';
import {
  EMPTY_CONTRACTS_FILTER,
  isContractsFilterActive,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import { ContractDayHeader } from './ContractCells';
import { ContractsFilterBar } from './ContractsFilterBar';
import { CONTRACTS_HISTORY_COLUMN_IDS, type ContractsHistoryColumnId } from './contractsColumns';

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
  notices: ReactNode;
}

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
        resultCount={rows.length}
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
      {rows.length === 0 ? (
        isContractsFilterActive(filter) ? (
          <EmptyState
            title={t('contracts.noFilterMatches')}
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
        <div className="relative overflow-x-auto edge-fade-end">
          <DataTable
            {...tableExport.tableProps}
            label={t('contracts.title')}
            columns={columns}
            rows={rows}
            rowKey={contractRowKey}
            virtualize="auto"
            highlightRowKey={highlightedContractId}
            {...sortProps}
            stackLayout="dense"
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
