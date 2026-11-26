import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useOpenParam } from '@/lib/useOpenParam';
import {
  Button,
  DataAgeBadge,
  CachedEmptyState,
  LoadFailedState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Tabs,
  TabPanel,
  useTabsId,
  CachedNotice,
  IncompleteNotice,
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
import { buybackCueText, useBuybackLinks } from '@/features/communities/buybackLinks';
import { useCourierLocationNames } from '@/features/character/useCourierLocationNames';
import { usePageTab } from '@/lib/usePageTab';
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
import { useCharacterCountOrLoading, useCharacterNames } from '@/features/character/useCharacters';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';

const CORP_CONTRACTS_SCOPE = ESI_REGISTRY.getCorporationContracts.scope;
const SCOPE_PARAM = optionalEnumParam(['corp'] as const);
const SOURCE_PARAMS = { scope: SCOPE_PARAM, 'history.chars': characterFilterParam('current') };

const loadCorpSnapshot: typeof import('@/features/contracts/corpContractsSnapshot').loadCorpContractsSnapshot =
  (characterId, signal) =>
    import('@/features/contracts/corpContractsSnapshot').then((m) =>
      m.loadCorpContractsSnapshot(characterId, signal)
    );

const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][];
const CONTRACT_TYPES = Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][];

const HISTORY_FILTER_PARAMS = {
  'history.q': textParam(),
  'history.status': optionalEnumParam(CONTRACT_STATUSES),
  'history.type': optionalEnumParam(CONTRACT_TYPES),
};
const HISTORY_SORT = { columnId: 'issued', direction: 'desc' } as const;

export function Contracts() {
  const { t } = useTranslation();

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
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContractsFilter) =>
    setHistoryParams({
      'history.q': next.text,
      'history.status': next.status,
      'history.type': next.type,
    });
  const highlightParamId = useHighlightParam();
  const openParamId = useOpenParam();
  const highlightedContractId = highlightParamId ?? openParamId;

  const [searchStatus, setSearchStatus] = useState<ContractSearchStatus | null>(null);

  const [tabId, setTabId] = usePageTab(CONTRACTS_TABS);
  const tabsId = useTabsId();
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
  const corpRequested = tab === 'history' && scopeParam === 'corp';
  const corpPending = corpRequested && granted === undefined;
  const corpSource = corpRequested && corpAvailable;
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
  const selectionScope = `${source}:${activeCharacterId}:${view.corporationId}`;
  const [paramOpenDismissed, setParamOpenDismissed] = useState(tab !== 'history');
  const openContract = useCallback(
    (contract: Contract | null) => {
      setParamOpenDismissed(true);
      setPicked(contract && { scope: selectionScope, contract });
    },
    [selectionScope]
  );
  const selectTab = useCallback(
    (next: string) => {
      setTabId(next === 'search/items' || next === 'search/courier' ? next : 'history');
    },
    [setTabId]
  );
  const pageTabs = useMemo(
    () => [
      { id: 'history', label: t('contracts.historyTab') },
      { id: 'search/items', label: t('contracts.itemSearchTab') },
      { id: 'search/courier', label: t('contracts.courierTab') },
    ],
    [t]
  );

  const { columns, optionalColumns, columnVisibility, receiverFor, standingFor } =
    useContractsHistoryColumns({
      ownerOf: view.ownerOf,
      standingIndexFor: view.standingIndexFor,
      characterNameOf: view.characterNameOf,
      issuerNames,
      receiverCategories: view.receiverCategories,
      issuerAffiliations: view.issuerAffiliations,
      onOpen: openContract,
    });
  const historySortProps = useUrlSort('history.sort', HISTORY_SORT, [
    'contract',
    'character',
    ...CONTRACTS_HISTORY_COLUMN_IDS,
  ]);

  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
  );

  const paramContract =
    highlightedContractId !== null && !paramOpenDismissed
      ? (contracts.find((c) => c.contract_id === highlightedContractId) ?? null)
      : null;
  const highlightGone =
    tab === 'history' &&
    source === 'current' &&
    highlightParamId !== null &&
    !loading &&
    contractsResult !== null &&
    !contracts.some((c) => c.contract_id === highlightParamId);
  const selectedContract = picked?.scope === selectionScope ? picked.contract : paramContract;

  const statusOptions = useMemo(() => contractStatusOptions(contracts), [contracts]);
  const typeOptions = useMemo(() => contractTypeOptions(contracts), [contracts]);
  const selfOf = useMemo(() => (contract: Contract) => view.ownerOf(contract) ?? undefined, [view]);
  const filteredContracts = useMemo(
    () => filterContracts(contracts, rowsFilter, issuerNames, selfOf),
    [contracts, rowsFilter, issuerNames, selfOf]
  );
  const characterNames = useCharacterNames();
  const buybackLinks = useBuybackLinks(activeCharacterId);
  const courierCharacterOf = useCallback(
    (contract: Contract) => (source === 'all' ? view.ownerOf(contract) : activeCharacterId),
    [source, view, activeCharacterId]
  );
  const courierPlaceNames = useCourierLocationNames(
    contracts,
    courierCharacterOf,
    tab === 'history'
  );
  const historyCsvColumns = useMemo(
    () =>
      contractsCsvColumns(t, {
        nameFor: (id) => issuerNames.get(id) ?? `#${id}`,
        selfId: selfOf,
        characterNameFor:
          source === 'corporation'
            ? undefined
            : (contract) => {
                if (view.characterNameOf) return view.characterNameOf(contract);
                const owner = view.ownerOf(contract);
                return owner === null ? null : (characterNames.get(owner) ?? null);
              },
        standingFor,
        locationName: (id) => courierPlaceNames.get(id) ?? null,
        buybackFor: (contract) => {
          const link = buybackLinks.get(contract.contract_id);
          return link ? buybackCueText(t, link) : null;
        },
      }),
    [
      t,
      issuerNames,
      selfOf,
      source,
      view,
      standingFor,
      characterNames,
      courierPlaceNames,
      buybackLinks,
    ]
  );
  const historyExport = useTableExport({
    surface: 'contracts',
    rows: filteredContracts,
    columns: historyCsvColumns,
    truncated: contractsTruncated,
  });

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
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
  const modalCharacterId = source === 'all' ? modalOwner : activeCharacterId;
  const sourceLabel = {
    current: {
      emptyTitle: t('contracts.emptyTitle'),
      emptyHint: t('contracts.emptyHint'),
      fetchedTitle: t('contracts.emptyFetchedTitle'),
      fetchedHint: t('contracts.emptyFetchedHint'),
    },
    all: {
      emptyTitle: t('contracts.emptyTitle'),
      emptyHint: t('contracts.allEmptyHint'),
      fetchedTitle: t('contracts.emptyFetchedTitle'),
      fetchedHint: t('contracts.emptyFetchedHint'),
    },
    corporation: {
      emptyTitle: t('contracts.corpEmptyTitle'),
      emptyHint: t('contracts.corpEmptyHint'),
      fetchedTitle: t('contracts.corpEmptyFetchedTitle'),
      fetchedHint: undefined,
    },
  }[source];

  return (
    <div className="mx-auto max-w-page space-y-2 sm:space-y-4">
      <PageHeader
        title={t('contracts.title')}
        meta={
          tab === 'history' ? (
            contractsResult && !sourceHeld ? (
              <DataAgeBadge
                date={contractsResult.fetchedAt}
                expiresAt={contractsResult.expiresAt}
              />
            ) : undefined
          ) : searchStatus?.lastSyncedAt != null ? (
            <DataAgeBadge date={new Date(searchStatus.lastSyncedAt)} />
          ) : undefined
        }
        scope={
          tab === 'history' ? (
            <CharacterFilterControl<CharacterScopeChoice>
              corporation={corpAvailable}
              characterCount={characterCount}
              activeCharacterId={activeCharacterId}
              value={pickerValue}
              loading={sourceHeld || (loading && !active.data)}
              missingNames={view.skipped.map((c) => c.name)}
              onChange={changeSource}
            />
          ) : undefined
        }
        actions={
          tab === 'history' ? (
            <>
              <TableActionsMenu name={t('contracts.title')} tableExport={historyExport} size="md" />
              <IconButton
                icon={<Icon.Refresh />}
                label={t('contracts.refresh')}
                onClick={refresh}
                busy={loading}
              />
            </>
          ) : (
            <IconButton
              icon={<Icon.Refresh />}
              label={t('contractSearch.refresh')}
              onClick={() => searchStatus?.refresh()}
              busy={searchStatus === null || searchStatus.loading}
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
        {highlightGone && <p className="text-sm text-text-dim">{t('contracts.highlightGone')}</p>}
        {tab === 'search' ? (
          <ContractSearchPanel mode={mode} onStatusChange={setSearchStatus} />
        ) : sourceHeld || (loading && !active.data) ? (
          <Spinner block="page" label={t('common.loading')} />
        ) : needsReauth ? (
          source === 'corporation' ? (
            <GrantBanner characterId={activeCharacterId} endpoints={['getCorporationContracts']} />
          ) : (
            <GrantBanner characterId={activeCharacterId} endpoints={['getCharacterContracts']} />
          )
        ) : error || (source === 'corporation' && active.data && view.corporationId === null) ? (
          <LoadFailedState title={t('common.loadFailed.contracts')} onRetry={refresh} />
        ) : !contractsResult || contracts.length === 0 ? (
          <CachedEmptyState
            result={contractsResult}
            title={sourceLabel.emptyTitle}
            hint={sourceLabel.emptyHint}
            fetchedTitle={sourceLabel.fetchedTitle}
            fetchedHint={sourceLabel.fetchedHint}
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
                    <CachedNotice
                      withBadge
                      className="px-3 pt-2"
                      fetchedAt={contractsResult.fetchedAt}
                    />
                  )}
                  {contractsTruncated && (
                    <IncompleteNotice
                      className="px-3 pt-2"
                      action={
                        <Button size="sm" loading={loading} onClick={refresh}>
                          {t('contracts.fetchTruncatedRetry')}
                        </Button>
                      }
                    />
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
