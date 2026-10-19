import { NO_AFFILIATIONS, NO_NAMES } from '@/lib/emptyCollections';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  FilterChip,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  RowActionsMenu,
  Spinner,
  Tabs,
  TabPanel,
  useTabsId,
  Tooltip,
  type DataTableColumn,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  CONTRACTS_HISTORY_COLUMN_IDS,
  contractsHistoryColumnsStore,
  type ContractsHistoryColumnId,
} from '@/features/contracts/contractsColumns';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { GrantBanner } from '@/app/GrantNote';
import { contractAmount } from '@/features/character/contractAmount';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { ContractIdentity } from '@/features/character/ContractIdentity';
import { CharacterLink, CorporationLink } from '@/features/entities';
import { ContractReceiverLink } from '@/features/character/ContractReceiverLink';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { StandingTag } from '@/features/character/StandingTag';
import type { ContactStandingIndex } from '@/features/character/contactStandings';
import { characterStanding } from '@/features/character/entityStanding';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import {
  EMPTY_CONTRACTS_FILTER,
  isContractsFilterActive,
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
import { formatDateOnly } from '@/lib/timestamp';
import { cx } from '@/lib/cx';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { useTimeZone } from '@/lib/timeFormat';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import type { Contract } from '@/esi/endpoints';
import { useRememberedPageTab } from '@/lib/usePageTab';
import { useContractSearchMode } from '@/features/contractSearch/contractSearchModePref';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { optionalEnumParam, textParam } from '@/lib/urlState';
import { CONTRACTS_TABS } from '@/app/pageTabs';
import {
  ContractDateCell,
  ContractDayHeader,
  ContractStatusCell,
  CourierDeadlineCell,
} from '@/features/contracts/ContractCells';
import { ContractsFilterBar } from '@/features/contracts/ContractsFilterBar';
import { loadContractsSnapshot } from '@/features/contracts/contractsSnapshot';

const STATUS_TONE: Record<Contract['status'], string> = {
  outstanding: 'text-text',
  in_progress: 'text-warning',
  finished_issuer: 'text-success',
  finished_contractor: 'text-success',
  finished: 'text-success',
  cancelled: 'text-text-dim',
  rejected: 'text-danger',
  failed: 'text-danger',
  deleted: 'text-text-dim',
  reversed: 'text-danger',
};

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_CATEGORIES: ReadonlyMap<number, NameCategory> = new Map();
const NO_STANDING_INDEX: ContactStandingIndex = new Map();

/** Module-level so the table's windowing and row memo see one stable function. */
const contractRowKey = (contract: Contract) => contract.contract_id;

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
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContractsSnapshot,
    undefined,
    { cacheKey: 'contracts' }
  );

  const historyColumnVisibility = useColumnVisibility(
    contractsHistoryColumnsStore,
    CONTRACTS_HISTORY_COLUMN_IDS
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

  // The identity column (never hidden — it opens the detail modal) plus the
  // optional columns the picker controls, in table order —
  // `CONTRACTS_HISTORY_COLUMN_IDS`' own order.
  const receiverFor = useCallback(
    (contract: Contract) =>
      activeCharacterId === null
        ? null
        : contractReceiver(contract, activeCharacterId, receiverCategories),
    [activeCharacterId, receiverCategories]
  );
  const optionalHistoryColumns = useMemo<
    Record<ContractsHistoryColumnId, DataTableColumn<Contract>>
  >(
    () => ({
      status: {
        id: 'status',
        header: t('contracts.status'),
        className: 'font-semibold',
        cellClassName: (contract) => STATUS_TONE[contract.status],
        sortValue: (contract) => t(CONTRACT_STATUS_KEY[contract.status]),
        render: (contract) => <ContractStatusCell contract={contract} />,
      },
      issuer: {
        id: 'issuer',
        header: t('contracts.issuer'),
        sortValue: (contract) => {
          const { id } = contractIssuer(contract);
          return issuerNames.get(id) ?? `#${id}`;
        },
        render: (contract) => {
          const issuer = contractIssuer(contract);
          const name = issuerNames.get(issuer.id) ?? `#${issuer.id}`;
          return (
            <span className="inline-flex items-center gap-1.5">
              {issuer.kind === 'corporation' ? (
                <CorporationLink id={issuer.id} className="text-left">
                  {name}
                </CorporationLink>
              ) : (
                <CharacterLink id={issuer.id} className="text-left">
                  {name}
                </CharacterLink>
              )}
              {issuer.kind === 'character' && (
                <StandingTag
                  standing={characterStanding(standingIndex, issuer.id, issuerAffiliations)}
                />
              )}
            </span>
          );
        },
      },
      receiver: {
        id: 'receiver',
        header: t('contracts.receiver'),
        sortValue: (contract) => {
          const receiver = receiverFor(contract);
          return receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : '';
        },
        render: (contract) => {
          const receiver = receiverFor(contract);
          // No receiver (a public contract nobody took): the phone card's meta
          // line leaves the placeholder dash off rather than print a bare "—".
          if (receiver === null)
            return (
              <span className="text-text-dim" data-dense-omit>
                —
              </span>
            );
          return (
            <ContractReceiverLink
              receiver={receiver}
              name={receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : ''}
              standing={
                receiver?.kind === 'character'
                  ? characterStanding(standingIndex, receiver.id, issuerAffiliations)
                  : null
              }
            />
          );
        },
      },
      price: {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        className: 'tabular-nums',
        // The dense phone card's headline figure, beside the title.
        cardCorner: true,
        sortValue: (contract) => contractAmount(contract),
        render: (contract) => {
          const amount = contractAmount(contract);
          return amount !== undefined ? <IskAmount value={amount} /> : t('common.unknown');
        },
      },
      issued: {
        id: 'issued',
        header: t('contracts.issued'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (contract) => new Date(contract.date_issued).getTime(),
        // Off the phone card: its day section header already says it.
        render: (contract) => (
          <span data-dense-omit>
            <ContractDateCell iso={contract.date_issued} timeZone={timeZone} />
          </span>
        ),
      },
      expires: {
        id: 'expires',
        header: t('contracts.expires'),
        className: 'whitespace-nowrap text-text-dim',
        // An accepted courier's clock is delivery, not the accept-by expiry.
        sortValue: (contract) =>
          courierDeliveryDeadlineMs(contract) ?? new Date(contract.date_expired).getTime(),
        render: (contract) => {
          const deadlineMs = courierDeliveryDeadlineMs(contract);
          if (deadlineMs === null)
            return (
              <span>
                {/* Phone card only: its meta line has no column labels. */}
                <span className="sm:hidden">{t('contracts.expiresAffix')}</span>
                <ContractDateCell iso={contract.date_expired} timeZone={timeZone} />
              </span>
            );
          return <CourierDeadlineCell deadlineMs={deadlineMs} timeZone={timeZone} />;
        },
      },
    }),
    [t, issuerNames, timeZone, standingIndex, issuerAffiliations, receiverFor]
  );
  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        sortValue: (contract) => contract.title || t(CONTRACT_TYPE_KEY[contract.type]),
        render: (contract) => {
          const opener = (
            <button
              type="button"
              onClick={() => setSelectedContract(contract)}
              className={entityLinkClassName(
                cx(
                  'flex min-h-11 w-full items-center text-left font-medium md:block md:min-h-0 md:w-auto',
                  contract.title && 'md:max-w-72 md:truncate'
                )
              )}
            >
              {/* Phone only: the status tone as a dot, so a scan down the card
                  list reads outcome without the Status column (which the
                  picker can hide). The word stays on the meta line. */}
              <span
                aria-hidden="true"
                className={cx(
                  'mr-2 size-2 shrink-0 rounded-full bg-current sm:hidden',
                  STATUS_TONE[contract.status]
                )}
              />
              <ContractIdentity contract={contract} characterId={activeCharacterId} />
            </button>
          );
          // A title is the only free-text (so truncatable) identity; the full
          // text reaches the tooltip on hover and touch-and-hold.
          return contract.title ? <Tooltip content={contract.title}>{opener}</Tooltip> : opener;
        },
      },
      ...CONTRACTS_HISTORY_COLUMN_IDS.filter(historyColumnVisibility.isVisible).map(
        (id) => optionalHistoryColumns[id]
      ),
    ],
    [t, optionalHistoryColumns, historyColumnVisibility.isVisible, activeCharacterId]
  );
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
            <ContractsFilterBar
              filter={filter}
              onChange={setFilter}
              statusOptions={statusOptions}
              typeOptions={typeOptions}
              actions={
                <ColumnPickerMenu
                  available={CONTRACTS_HISTORY_COLUMN_IDS}
                  visible={historyColumnVisibility.visible}
                  columnsById={optionalHistoryColumns}
                  showLabel
                  onToggle={historyColumnVisibility.toggle}
                  buttonLabel={t('common.columnsButton')}
                  menuTitle={t('common.columnsMenuTitle')}
                  onReset={historyColumnVisibility.reset}
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
                onToggle={() => setFilter({ ...filter, status: null })}
              />
              {statusOptions.map((status) => (
                <FilterChip
                  key={status}
                  label={t(CONTRACT_STATUS_KEY[status])}
                  selected={filter.status === status}
                  onToggle={() =>
                    setFilter({ ...filter, status: filter.status === status ? null : status })
                  }
                />
              ))}
            </div>
            {filteredContracts.length === 0 ? (
              // Zero matches with no active filter can't happen today (an empty
              // list is caught above), but the reset only belongs where a filter is on.
              isContractsFilterActive(filter) ? (
                <EmptyState
                  title={t('contracts.noFilterMatches')}
                  hint={t('contracts.noFilterMatchesResetHint')}
                  className="py-8"
                  action={
                    <Button size="sm" onClick={() => setFilter(EMPTY_CONTRACTS_FILTER)}>
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
                  {...historyExport.tableProps}
                  label={t('contracts.title')}
                  columns={columns}
                  rows={filteredContracts}
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
                  {...historySortProps}
                  stackLayout="dense"
                  // Issue days are sections on a phone, not folded duplicates:
                  // open, with members in line with the cards above them.
                  className="dt-flat-groups"
                  groupBy={{
                    key: (contract) => formatDateOnly(new Date(contract.date_issued), timeZone),
                    minSize: 1,
                    defaultExpanded: () => true,
                    renderHeader: (rows) => (
                      <ContractDayHeader
                        date={formatDateOnly(new Date(rows[0].date_issued), timeZone)}
                        count={rows.length}
                        timeZone={timeZone}
                      />
                    ),
                  }}
                />
              </div>
            )}
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
