import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CachedEmptyState,
  CachedNotice,
  DataAgeBadge,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { GrantBanner } from '@/app/GrantNote';
import type { Contract } from '@/esi/endpoints';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { contractIssuer } from '@/features/character/contractCounterparty';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import {
  contractStatusOptions,
  contractTypeOptions,
  filterContracts,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import { NO_AFFILIATIONS } from '@/lib/emptyCollections';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { optionalEnumParam, textParam } from '@/lib/urlState';
import { CONTRACTS_HISTORY_COLUMN_IDS } from './contractsColumns';
import { ContractsHistoryTable } from './ContractsHistoryTable';
import { loadCorpContractsSnapshot } from './corpContractsSnapshot';
import { useContractsHistoryColumns } from './useContractsHistoryColumns';

const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][];
const CONTRACT_TYPES = Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][];

/** The Corp view's own filter, in the URL (ADR 0015); its keys never collide with History's. */
const CORP_FILTER_PARAMS = {
  'corp.q': textParam(),
  'corp.status': optionalEnumParam(CONTRACT_STATUSES),
  'corp.type': optionalEnumParam(CONTRACT_TYPES),
};
const CORP_SORT = { columnId: 'issued', direction: 'desc' } as const;
const NO_STANDINGS = new Map();

/**
 * The Contracts page's Corp scope: the corporation's contracts (issued by or
 * assigned to it) in the History table. Items are read when a row is opened,
 * never for the list.
 */
export function CorpContractsView() {
  const { t } = useTranslation();
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadCorpContractsSnapshot,
    undefined,
    { cacheKey: 'contracts-corp' }
  );
  const [selected, setSelected] = useState<Contract | null>(null);
  const [params, setParams] = useUrlParams(CORP_FILTER_PARAMS);
  const filter = useMemo<ContractsFilter>(
    () => ({ text: params['corp.q'], status: params['corp.status'], type: params['corp.type'] }),
    [params]
  );
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContractsFilter) =>
    setParams({ 'corp.q': next.text, 'corp.status': next.status, 'corp.type': next.type });
  const highlightedContractId = useHighlightParam();

  const corporationId = data?.corporationId ?? null;
  const names = data?.names;
  const { columns, optionalColumns, columnVisibility, receiverFor } = useContractsHistoryColumns({
    // The corporation is "self" here: a contract it took or was offered is not worth a column cell.
    activeCharacterId: corporationId,
    issuerNames: names ?? new Map(),
    receiverCategories: data?.receiverCategories ?? new Map(),
    standingIndex: NO_STANDINGS,
    issuerAffiliations: NO_AFFILIATIONS,
    onOpen: setSelected,
  });
  const sortProps = useUrlSort('corp.sort', CORP_SORT, ['type', ...CONTRACTS_HISTORY_COLUMN_IDS]);

  const contractsResult = data?.contractsResult ?? null;
  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
  );
  const statusOptions = useMemo(() => contractStatusOptions(contracts), [contracts]);
  const typeOptions = useMemo(() => contractTypeOptions(contracts), [contracts]);
  const rows = useMemo(
    () => filterContracts(contracts, rowsFilter, names ?? new Map(), corporationId ?? undefined),
    [contracts, rowsFilter, names, corporationId]
  );
  const csvColumns = useMemo(
    () => contractsCsvColumns(t, (id) => names?.get(id) ?? `#${id}`, corporationId ?? undefined),
    [t, names, corporationId]
  );
  const tableExport = useTableExport({
    surface: 'contracts',
    rows,
    columns: csvColumns,
    truncated: data?.truncated ?? false,
  });

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  const modalReceiver = selected && corporationId !== null ? receiverFor(selected) : null;
  const nameOf = (id: number) => names?.get(id) ?? `#${id}`;

  let body;
  if (activeCharacterId === null) body = null;
  else if (data?.needsReauth) {
    body = (
      <GrantBanner
        characterId={activeCharacterId}
        endpoints={['getCorporationContracts']}
        title={t('contracts.corpReauthTitle')}
        hint={t('contracts.corpReauthHint')}
        actionLabel={t('contracts.reauthAction')}
      />
    );
  } else if (error || (data && data.corporationId === null)) {
    body = <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  } else if (!contractsResult || contracts.length === 0) {
    body = (
      <CachedEmptyState
        result={contractsResult}
        title={t('contracts.corpEmptyTitle')}
        hint={t('contracts.corpEmptyHint')}
        fetchedTitle={t('contracts.corpEmptyFetchedTitle')}
      />
    );
  } else {
    body = (
      <Panel padded={false}>
        <ContractsHistoryTable
          filter={filter}
          onFilterChange={setFilter}
          statusOptions={statusOptions}
          typeOptions={typeOptions}
          rows={rows}
          columns={columns}
          optionalColumns={optionalColumns}
          columnVisibility={columnVisibility}
          tableExport={tableExport}
          sortProps={sortProps}
          highlightedContractId={highlightedContractId}
          notices={
            <>
              {contractsResult.fromCache && (
                <CachedNotice className="px-3 pt-2" fetchedAt={contractsResult.fetchedAt} />
              )}
              {data?.truncated && (
                <p className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  <span>{t('common.incompleteTitle')}</span>
                  <Button size="sm" disabled={loading} onClick={refresh}>
                    {t('contracts.fetchTruncatedRetry')}
                  </Button>
                </p>
              )}
            </>
          }
        />
      </Panel>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {contractsResult && <DataAgeBadge date={contractsResult.fetchedAt} />}
        <TableActionsMenu
          name={t('contracts.corpScope')}
          tableExport={tableExport}
          size="md"
          showLabel
        />
        <IconButton
          icon={<Icon.Refresh />}
          label={t('contracts.refresh')}
          onClick={refresh}
          disabled={loading}
        />
      </div>
      {body}
      {selected && activeCharacterId !== null && corporationId !== null && (
        <ContractDetailModal
          characterId={activeCharacterId}
          corporationId={corporationId}
          contract={selected}
          issuerName={nameOf(contractIssuer(selected).id)}
          receiver={modalReceiver}
          receiverName={modalReceiver ? nameOf(modalReceiver.id) : ''}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
