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
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import type { Contract } from '@/esi/endpoints';
import { useRememberedPageTab } from '@/lib/usePageTab';
import { useContractSearchMode } from '@/features/contractSearch/contractSearchModePref';
import { useRememberedUrlParams, useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { optionalEnumParam, textParam } from '@/lib/urlState';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { ESI_REGISTRY } from '@/esi/registry';
import { CONTRACTS_TABS } from '@/app/pageTabs';
import {
  CharacterFilterControl,
  type CharacterScopeChoice,
} from '@/features/character/CharacterFilterControl';
import { ContractsHistoryTable } from '@/features/contracts/ContractsHistoryTable';
import { useContractsHistoryColumns } from '@/features/contracts/useContractsHistoryColumns';
import { loadContractsSnapshot } from '@/features/contracts/contractsSnapshot';
import { loadAllContractsSnapshot } from '@/features/contracts/allContractsSnapshot';
import {
  allContractsView,
  corpContractsView,
  currentContractsView,
} from '@/features/contracts/contractsHistoryView';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';

const CORP_CONTRACTS_SCOPE = ESI_REGISTRY.getCorporationContracts.scope;
/** `?scope=corp` on History: the corporation's contracts. Absent is the Character's own (ADR 0015). */
const SCOPE_PARAM = optionalEnumParam(['corp'] as const);
/** What History reads from, in the URL: Corporation, else This / All characters (remembered, ADR 0015). */
const SOURCE_PARAMS = { scope: SCOPE_PARAM, 'history.chars': characterFilterParam('current') };

/** The corp read is its own chunk: its loaders are for the pilots who can use them. */
const loadCorpSnapshot: typeof import('@/features/contracts/corpContractsSnapshot').loadCorpContractsSnapshot =
  (characterId, signal) =>
    import('@/features/contracts/corpContractsSnapshot').then((m) =>
      m.loadCorpContractsSnapshot(characterId, signal)
    );

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

  // The open contract belongs to the source it was read under (see `selectionScope`).
  const [picked, setPicked] = useState<{ scope: string; contract: Contract } | null>(null);
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
  // Hide, don't lock: no Corp choice for a Character without the grant. ESI asks for no
  // in-game role on this read, so the scope alone is the gate (decision 20261020-215532).
  const granted = useGrantedScopes();
  const rememberedChars = useRememberedCharacterFilter<typeof SOURCE_PARAMS>(
    'contracts',
    'history.chars'
  );
  const [sourceParams, setSourceParams] = useRememberedUrlParams(SOURCE_PARAMS, rememberedChars);
  const scopeParam = sourceParams.scope;
  const charactersValue = sourceParams['history.chars'];
  const characterCount = useCharacterCountOrLoading();
  const corpAvailable = granted?.includes(CORP_CONTRACTS_SCOPE) ?? false;
  const tab: 'search' | 'history' = tabId === 'history' ? 'history' : 'search';
  const mode: ContractMode = tabId === 'search/courier' ? 'courier' : 'items';
  // A `?scope=corp` link names the corp source before the grant is known. Hold that choice
  // (no Character read of any kind) until `granted` resolves.
  const corpRequested = tab === 'history' && scopeParam === 'corp';
  const corpPending = corpRequested && granted === undefined;
  const corpSource = corpRequested && corpAvailable;
  // "All characters" needs more than one Character; the count is unknown for a moment.
  const allRequested = tab === 'history' && !corpRequested && charactersValue === 'all';
  const allPending = allRequested && characterCount === undefined;
  const allSource = allRequested && (characterCount ?? 0) > 1;
  const source = corpSource ? 'corporation' : allSource ? 'all' : 'current';
  const sourceHeld = corpPending || allPending;
  const currentSnap = useRouteSnapshot(loadContractsSnapshot, undefined, {
    cacheKey: 'contracts',
    skip: source !== 'current' || sourceHeld,
  });
  const allSnap = useRouteSnapshot(loadAllContractsSnapshot, undefined, {
    cacheKey: 'contracts-all',
    skip: source !== 'all',
  });
  const corpSnap = useRouteSnapshot(loadCorpSnapshot, undefined, {
    cacheKey: 'contracts-corp',
    skip: source !== 'corporation',
  });
  const { hydrated, activeCharacterId } = currentSnap;
  const active = source === 'all' ? allSnap : source === 'corporation' ? corpSnap : currentSnap;
  const { error, loading, refresh } = active;
  const view = useMemo(
    () =>
      source === 'all'
        ? allContractsView(allSnap.data)
        : source === 'corporation'
          ? corpContractsView(corpSnap.data)
          : currentContractsView(currentSnap.data, activeCharacterId),
    [source, allSnap.data, corpSnap.data, currentSnap.data, activeCharacterId]
  );
  const { contractsResult, issuerNames, needsReauth, truncated: contractsTruncated } = view;
  const pickerValue: CharacterScopeChoice =
    corpPending || corpSource ? 'corporation' : allRequested ? 'all' : 'current';
  const changeSource = (next: CharacterScopeChoice) =>
    setSourceParams({
      scope: next === 'corporation' ? 'corp' : null,
      'history.chars': next === 'corporation' ? charactersValue : next,
    });
  // A switch of Character, source or corporation drops the open contract, so the modal
  // never pairs one party's reads with another's contract id.
  const selectionScope = `${source}:${activeCharacterId}:${view.corporationId}`;
  const selectedContract = picked?.scope === selectionScope ? picked.contract : null;
  const openContract = useCallback(
    (contract: Contract | null) => setPicked(contract && { scope: selectionScope, contract }),
    [selectionScope]
  );
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
    ownerOf: view.ownerOf,
    standingIndexFor: view.standingIndexFor,
    characterNameOf: view.characterNameOf,
    issuerNames,
    receiverCategories: view.receiverCategories,
    issuerAffiliations: view.issuerAffiliations,
    onOpen: openContract,
  });
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const historySortProps = useUrlSort('history.sort', HISTORY_SORT, [
    'type',
    'character',
    ...CONTRACTS_HISTORY_COLUMN_IDS,
  ]);

  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
  );

  const statusOptions = useMemo(() => contractStatusOptions(contracts), [contracts]);
  const typeOptions = useMemo(() => contractTypeOptions(contracts), [contracts]);
  const selfOf = useMemo(() => (contract: Contract) => view.ownerOf(contract) ?? undefined, [view]);
  const filteredContracts = useMemo(
    () => filterContracts(contracts, rowsFilter, issuerNames, selfOf),
    [contracts, rowsFilter, issuerNames, selfOf]
  );
  const historyCsvColumns = useMemo(
    () => contractsCsvColumns(t, (id) => issuerNames.get(id) ?? `#${id}`, selfOf),
    [t, issuerNames, selfOf]
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
  const modalOwner = selectedContract ? view.ownerOf(selectedContract) : null;
  const modalStandings = modalOwner === null ? null : view.standingIndexFor(modalOwner);
  const standingOf = (id: number) =>
    modalStandings ? characterStanding(modalStandings, id, view.issuerAffiliations) : null;
  // The ESI reads for a row's items and places run as the Character it was read for.
  const modalCharacterId = source === 'all' ? modalOwner : activeCharacterId;
  const sourceLabel = {
    current: {
      emptyTitle: t('contracts.emptyTitle'),
      emptyHint: t('contracts.emptyHint'),
      fetchedTitle: t('contracts.emptyFetchedTitle'),
    },
    all: {
      emptyTitle: t('contracts.emptyTitle'),
      emptyHint: t('contracts.allEmptyHint'),
      fetchedTitle: t('contracts.emptyFetchedTitle'),
    },
    corporation: {
      emptyTitle: t('contracts.corpEmptyTitle'),
      emptyHint: t('contracts.corpEmptyHint'),
      fetchedTitle: t('contracts.corpEmptyFetchedTitle'),
    },
  }[source];

  return (
    <div className="mx-auto max-w-6xl space-y-2 sm:space-y-4">
      {/* Both tabs read something datable and reloadable, but not the same
          thing: History is the chosen source's contract list (this Character,
          all of them, or the corporation; the table looks the same for each),
          Search a shared public snapshot the panel below owns. So the badge and
          the Refresh are per tab — the export button is History-only, because
          it exports that list and nothing on Search corresponds to it. */}
      <PageHeader
        title={t('contracts.title')}
        meta={
          tab === 'history' ? (
            contractsResult && !sourceHeld ? (
              <DataAgeBadge date={contractsResult.fetchedAt} />
            ) : undefined
          ) : searchStatus?.lastSyncedAt != null ? (
            <DataAgeBadge date={new Date(searchStatus.lastSyncedAt)} />
          ) : undefined
        }
        // History only: the Search tabs read a shared public snapshot, nobody's.
        scope={
          tab === 'history' ? (
            <CharacterFilterControl<CharacterScopeChoice>
              corporation={corpAvailable}
              characterCount={characterCount}
              activeCharacterId={activeCharacterId}
              value={pickerValue}
              // A source switch spins in the trigger while the body waits on it.
              loading={sourceHeld || (loading && !active.data)}
              // Who "All" leaves out (never granted contracts): the trigger's dot and menu note.
              missingNames={view.skipped.map((c) => c.name)}
              onChange={changeSource}
            />
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
        ) : sourceHeld || (loading && !active.data) ? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : needsReauth ? (
          source === 'corporation' ? (
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCorporationContracts']}
              title={t('contracts.corpReauthTitle')}
              hint={t('contracts.corpReauthHint')}
              actionLabel={t('contracts.reauthAction')}
            />
          ) : (
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCharacterContracts']}
              title={t('contracts.reauthTitle')}
              hint={t('contracts.reauthHint')}
              actionLabel={t('contracts.reauthAction')}
            />
          )
        ) : error || (source === 'corporation' && active.data && view.corporationId === null) ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : !contractsResult || contracts.length === 0 ? (
          <CachedEmptyState
            result={contractsResult}
            title={sourceLabel.emptyTitle}
            hint={sourceLabel.emptyHint}
            fetchedTitle={sourceLabel.fetchedTitle}
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

      {tab === 'history' && selectedContract && modalCharacterId !== null && (
        <ContractDetailModal
          characterId={modalCharacterId}
          corporationId={source === 'corporation' ? (view.corporationId ?? undefined) : undefined}
          contract={selectedContract}
          issuerName={
            issuerNames.get(contractIssuer(selectedContract).id) ??
            `#${contractIssuer(selectedContract).id}`
          }
          issuerStanding={
            contractIssuer(selectedContract).kind === 'character'
              ? standingOf(contractIssuer(selectedContract).id)
              : null
          }
          receiver={modalReceiver}
          receiverName={modalReceiverName}
          receiverStanding={
            modalReceiver?.kind === 'character' ? standingOf(modalReceiver.id) : null
          }
          onClose={() => openContract(null)}
        />
      )}
    </div>
  );
}
