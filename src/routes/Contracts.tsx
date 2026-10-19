import { NO_AFFILIATIONS, NO_NAMES } from '@/lib/emptyCollections';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import {
  Button,
  DataAgeBadge,
  CachedEmptyState,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Tabs,
  TabPanel,
  useTabsId,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CONTRACTS_HISTORY_COLUMN_IDS } from '@/features/contracts/contractsColumns';
import { GrantBanner } from '@/app/GrantNote';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { contractIssuer } from '@/features/character/contractCounterparty';
import type { ContactStandingIndex } from '@/features/character/contactStandings';
import { characterStanding } from '@/features/character/entityStanding';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import {
  contractStatusOptions,
  contractTypeOptions,
  filterContracts,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import {
  ContractSearchPanel,
  type ContractMode,
  type ContractSearchStatus,
} from '@/features/contractSearch/ContractSearchPanel';
import type { NameCategory } from '@/features/character/names';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import type { Contract } from '@/esi/endpoints';
import { useRememberedPageTab } from '@/lib/usePageTab';
import { useContractSearchMode } from '@/features/contractSearch/contractSearchModePref';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { optionalEnumParam, textParam } from '@/lib/urlState';
import { CONTRACTS_TABS } from '@/app/pageTabs';
import { ContractsHistoryTable } from '@/features/contracts/ContractsHistoryTable';
import { useContractsHistoryColumns } from '@/features/contracts/useContractsHistoryColumns';
import { loadContractsSnapshot } from '@/features/contracts/contractsSnapshot';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_CATEGORIES: ReadonlyMap<number, NameCategory> = new Map();
const NO_STANDING_INDEX: ContactStandingIndex = new Map();

const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][];
const CONTRACT_TYPES = Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][];

/** The History table's own filter, in the URL (ADR 0015) as one group. */
const HISTORY_FILTER_PARAMS = {
  'history.q': textParam(),
  'history.status': optionalEnumParam(CONTRACT_STATUSES),
  'history.type': optionalEnumParam(CONTRACT_TYPES),
};
/** Newest-issued first — an untouched History view. */
const HISTORY_SORT = { columnId: 'issued', direction: 'desc' } as const;

/** Contracts: table with status chips, stale offers dimmed, detail on click. Read-only, cached for offline. */
export function Contracts() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContractsSnapshot,
    undefined,
    { cacheKey: 'contracts' }
  );

  const contractsResult = data?.contractsResult ?? null;
  const contractsNeedsReauth = data?.contractsNeedsReauth ?? false;
  const contractsTruncated = data?.contractsTruncated ?? false;
  const issuerNames = data?.issuerNames ?? NO_NAMES;
  const receiverCategories = data?.receiverCategories ?? NO_CATEGORIES;
  const standingIndex = data?.standingIndex ?? NO_STANDING_INDEX;
  const issuerAffiliations = data?.issuerAffiliations ?? NO_AFFILIATIONS;

  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [historyParams, setHistoryParams] = useUrlParams(HISTORY_FILTER_PARAMS);
  const filter = useMemo<ContractsFilter>(
    () => ({
      text: historyParams['history.q'],
      status: historyParams['history.status'],
      type: historyParams['history.type'],
    }),
    [historyParams]
  );
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar and its setter keep the immediate one.
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContractsFilter) =>
    setHistoryParams({
      'history.q': next.text,
      'history.status': next.status,
      'history.type': next.type,
    });
  // The contract a `contractAccepted` alert pointed at, if any.
  const highlightedContractId = useHighlightParam();

  /**
   * Item search's and Courier's own freshness and reload, reported up by the panel so the
   * page header can draw them beside the route title — the same slot the
   * History tab's badge and Refresh use, and the same slot every other route
   * puts them in. Null until that panel has mounted and loaded something.
   */
  const [searchStatus, setSearchStatus] = useState<ContractSearchStatus | null>(null);

  const rememberedMode = useContractSearchMode((state) => state.value);
  const rememberedModeHydrated = useHydratedStore(useContractSearchMode);
  const setRememberedMode = useContractSearchMode((state) => state.setValue);
  /**
   * A bare `/contracts` visit lands on whichever of Item search and Courier
   * was last used (issue #1719), while a link naming a tab — even
   * `search/items` itself — keeps it. The route/tab itself stays unpersisted
   * (decision `20260912-141100`); only the mode is remembered, and only
   * picking one of those two tabs stores it.
   */
  const rememberedTab = useMemo(
    () => ({
      value: `search/${rememberedMode}` as const,
      hydrated: rememberedModeHydrated,
    }),
    [rememberedMode, rememberedModeHydrated]
  );
  /**
   * The page's tab id is a full path suffix (`search/items`, `search/courier`,
   * `history`) — see `CONTRACTS_TABS`. Item search and Courier are one
   * public-contracts panel showing either corpus, so `tab` folds them together
   * for what the page header and body draw, and `mode` says which corpus.
   */
  const [tabId, setTabId] = useRememberedPageTab(CONTRACTS_TABS, rememberedTab);
  const tabsId = useTabsId();
  const tab: 'search' | 'history' = tabId === 'history' ? 'history' : 'search';
  const mode: ContractMode = tabId === 'search/courier' ? 'courier' : 'items';
  const selectTab = useCallback(
    (next: string) => {
      if (next === 'search/items' || next === 'search/courier') {
        setTabId(next);
        void setRememberedMode(next === 'search/courier' ? 'courier' : 'items');
      } else {
        setTabId('history');
      }
    },
    [setTabId, setRememberedMode]
  );
  const pageTabs = useMemo(
    () => [
      { id: 'search/items', label: t('contracts.itemSearchTab') },
      { id: 'search/courier', label: t('contracts.courierTab') },
      { id: 'history', label: t('contracts.historyTab') },
    ],
    [t]
  );

  const { columns, optionalColumns, columnVisibility, receiverFor } = useContractsHistoryColumns({
    activeCharacterId,
    issuerNames,
    receiverCategories,
    standingIndex,
    issuerAffiliations,
    onOpen: setSelectedContract,
  });
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const historySortProps = useUrlSort('history.sort', HISTORY_SORT, [
    'type',
    ...CONTRACTS_HISTORY_COLUMN_IDS,
  ]);

  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
  );

  const statusOptions = useMemo(() => contractStatusOptions(contracts), [contracts]);
  const typeOptions = useMemo(() => contractTypeOptions(contracts), [contracts]);
  const filteredContracts = useMemo(
    () => filterContracts(contracts, rowsFilter, issuerNames, activeCharacterId ?? undefined),
    [contracts, rowsFilter, issuerNames, activeCharacterId]
  );
  const historyCsvColumns = useMemo(
    () =>
      contractsCsvColumns(
        t,
        (id) => issuerNames.get(id) ?? `#${id}`,
        activeCharacterId ?? undefined
      ),
    [t, issuerNames, activeCharacterId]
  );
  const historyExport = useTableExport({
    surface: 'contracts',
    rows: filteredContracts,
    columns: historyCsvColumns,
    truncated: contractsTruncated,
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;
  const modalReceiver = selectedContract ? receiverFor(selectedContract) : null;
  const modalReceiverName = modalReceiver
    ? (issuerNames.get(modalReceiver.id) ?? `#${modalReceiver.id}`)
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-2 sm:space-y-4">
      {/* Both tabs read something datable and reloadable, but not the same
          thing: History is this character's own contract list, Search a shared
          public snapshot the panel below owns. So the badge and the Refresh
          are per tab — the export button is History-only, because it exports that
          character's contracts and nothing on Search corresponds to it. */}
      <PageHeader
        title={t('contracts.title')}
        meta={
          tab === 'history' ? (
            contractsResult ? (
              <DataAgeBadge date={contractsResult.fetchedAt} />
            ) : undefined
          ) : searchStatus?.lastSyncedAt != null ? (
            <DataAgeBadge date={new Date(searchStatus.lastSyncedAt)} />
          ) : undefined
        }
        actions={
          tab === 'history' ? (
            <>
              <TableActionsMenu
                name={t('contracts.title')}
                tableExport={historyExport}
                size="md"
                showLabel
              />
              <IconButton
                icon={<Icon.Refresh />}
                label={t('contracts.refresh')}
                onClick={refresh}
                disabled={loading}
              />
            </>
          ) : (
            <IconButton
              icon={<Icon.Refresh />}
              label={t('contractSearch.refresh')}
              onClick={() => searchStatus?.refresh()}
              disabled={searchStatus === null || searchStatus.loading}
            />
          )
        }
      />

      <Tabs
        tabsId={tabsId}
        tabs={pageTabs}
        value={tabId}
        onChange={selectTab}
        label={t('contracts.tabsLabel')}
      />

      <TabPanel tabsId={tabsId} tabId={tabId} className="space-y-2 sm:space-y-4">
        {/* Switched outside the history chain below, not inside it: Search needs
          neither this character's contracts nor its `contracts` scope, so a
          character with an empty history or a 403 must still reach it. */}
        {tab === 'search' ? (
          <ContractSearchPanel mode={mode} onStatusChange={setSearchStatus} />
        ) : loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : contractsNeedsReauth ? (
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterContracts']}
            title={t('contracts.reauthTitle')}
            hint={t('contracts.reauthHint')}
            actionLabel={t('contracts.reauthAction')}
          />
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : !contractsResult || contracts.length === 0 ? (
          <CachedEmptyState
            result={contractsResult}
            title={t('contracts.emptyTitle')}
            hint={t('contracts.emptyHint')}
            fetchedTitle={t('contracts.emptyFetchedTitle')}
          />
        ) : (
          <Panel padded={false}>
            <ContractsHistoryTable
              filter={filter}
              onFilterChange={setFilter}
              statusOptions={statusOptions}
              typeOptions={typeOptions}
              rows={filteredContracts}
              columns={columns}
              optionalColumns={optionalColumns}
              columnVisibility={columnVisibility}
              tableExport={historyExport}
              sortProps={historySortProps}
              highlightedContractId={highlightedContractId}
              notices={
                <>
                  {contractsResult.fromCache && (
                    <CachedNotice className="px-3 pt-2" fetchedAt={contractsResult.fetchedAt} />
                  )}
                  {contractsTruncated && (
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
        )}
      </TabPanel>

      {tab === 'history' && selectedContract && activeCharacterId !== null && (
        <ContractDetailModal
          characterId={activeCharacterId}
          contract={selectedContract}
          issuerName={
            issuerNames.get(contractIssuer(selectedContract).id) ??
            `#${contractIssuer(selectedContract).id}`
          }
          issuerStanding={
            contractIssuer(selectedContract).kind === 'character'
              ? characterStanding(
                  standingIndex,
                  contractIssuer(selectedContract).id,
                  issuerAffiliations
                )
              : null
          }
          receiver={modalReceiver}
          receiverName={modalReceiverName}
          receiverStanding={
            modalReceiver?.kind === 'character'
              ? characterStanding(standingIndex, modalReceiver.id, issuerAffiliations)
              : null
          }
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}
