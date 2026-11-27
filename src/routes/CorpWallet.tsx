import { NO_NAMES } from '@/lib/emptyCollections';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  focusRingInsetClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { useCallback, useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  DataAgeBadge,
  EmptyState,
  LoadFailedState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Tooltip,
  type DataTableColumn,
  type DataTableSort,
  CachedNotice,
  IncompleteNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type {
  CorporationDivisions,
  CorporationWalletDivision,
  CorporationWalletTransaction,
  WalletJournalEntry,
  WalletTransactionCommon,
} from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import type { JournalRow } from '@/engine/journalNetting';
import { journalTransactionLinks } from '@/features/character/journalTransactionLink';
import { loadTypeNames } from '@/features/character/typeNames';
import { resolveCategories, resolveNames } from '@/features/character/names';
import { journalPlayerId } from '@/engine/journalPlayer';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import {
  EMPTY_JOURNAL_FILTER_PARAMS,
  JOURNAL_FIELD_TO_PARAM,
  JOURNAL_FILTER_PARAMS,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import {
  JOURNAL_SORT,
  JOURNAL_SORT_COLUMN_IDS,
  typeNameLookup,
  useJournalColumnsBuilder,
  useJournalFilterResult,
} from '@/features/character/walletJournal';
import { JournalTable, type PlayerOption } from '@/features/character/WalletJournalTable';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { walletDivisions, type WalletDivision } from '@/features/corp/divisions';
import { useActiveCorporationIdState } from '@/features/corp/owner';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWalletTransactions,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { formatIsk } from '@/lib/isk';
import { intParam } from '@/lib/urlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useUrlFilter, useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { useActiveCharacter } from '@/stores/activeCharacter';

const DIVISION_PARAM = intParam(1, { min: 1, max: 7 });

const NO_IDS: ReadonlySet<number> = new Set();

const EMPTY_JOURNAL: readonly WalletJournalEntry[] = [];
const EMPTY_TRANSACTIONS: readonly CorporationWalletTransaction[] = [];

interface CorpBalancesSnapshot {
  walletsResult: StatusResult<CorporationWalletDivision[]>;
  divisionsResult: StatusResult<CorporationDivisions>;
}

async function loadCorpBalances(
  characterId: number,
  corporationId: number,
  canReadDivisions: boolean
): Promise<CorpBalancesSnapshot> {
  const [walletsResult, divisionsResult] = await Promise.all([
    loadCorporationWallets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId, canReadDivisions),
  ]);
  return { walletsResult, divisionsResult };
}

interface CorpTransactionsSnapshot {
  transactionsResult: StatusResult<CorporationWalletTransaction[]>;
  typeNames: Map<number, string>;
}

async function loadCorpTransactions(
  characterId: number,
  corporationId: number,
  division: number
): Promise<CorpTransactionsSnapshot> {
  const transactionsResult = await loadCorporationWalletTransactions(
    characterId,
    corporationId,
    division
  );
  const typeIds = [...new Set((transactionsResult.cached?.data ?? []).map((txn) => txn.type_id))];
  const typeNames = await loadTypeNames(typeIds);
  return { transactionsResult, typeNames };
}

interface CorpJournalSnapshot {
  journalResult: StatusResult<WalletJournalEntry[]>;
  playerIds: Set<number>;
  playerNames: Map<number, string>;
}

async function loadCorpJournal(
  characterId: number,
  corporationId: number,
  division: number
): Promise<CorpJournalSnapshot> {
  const journalResult = await loadCorporationWalletJournal(characterId, corporationId, division);
  const partyIds = (journalResult.cached?.data ?? []).flatMap((entry) =>
    [entry.first_party_id, entry.second_party_id].filter((id): id is number => id !== undefined)
  );
  const categories = await resolveCategories(partyIds);
  const characterIds = [...categories].filter(([, c]) => c === 'character').map(([id]) => id);
  return {
    journalResult,
    playerIds: new Set(characterIds),
    playerNames: await resolveNames(characterIds),
  };
}

interface CorpDivisionsPanelProps {
  balances: CorpBalancesSnapshot | null;
  loading: boolean;
  divisions: readonly WalletDivision[];
  selected: number;
  onSelect: (division: number) => void;
  divisionLabel: (entry: WalletDivision) => string;
  refreshFailed: boolean;
  onRetry: () => void;
}

function CorpDivisionsPanel({
  balances,
  loading,
  divisions,
  selected,
  onSelect,
  divisionLabel,
  refreshFailed,
  onRetry,
}: CorpDivisionsPanelProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const walletsResult = balances?.walletsResult.cached ?? null;
  const selectedEntry = divisions.find((entry) => entry.division === selected) ?? divisions[0];
  const shownDivisions = divisions.filter(
    (entry) => entry.name !== null || entry.balance !== 0 || entry === selectedEntry
  );
  const unused = divisions.length - shownDivisions.length;
  const foldable = isPhone && !loading && !!walletsResult && divisions.length > 1;
  const offlineNote = walletsResult?.fromCache ? (
    <CachedNotice
      withBadge
      className="mt-3"
      fetchedAt={walletsResult.fetchedAt}
      refreshFailed={refreshFailed}
    />
  ) : null;
  const total = divisions.reduce((sum, entry) => sum + entry.balance, 0);
  return (
    <CollapsiblePanel
      title={t('corp.wallet.divisionsTitle')}
      meta={
        !loading && walletsResult && divisions.length > 1 ? (
          <span>
            {t('corp.wallet.divisionsTotal')}{' '}
            <span className={cx('font-medium tabular-nums', iskToneClass(total))}>
              {formatIsk(total, 2)}
            </span>
          </span>
        ) : undefined
      }
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      toggleRef={toggleRef}
      collapsible={foldable}
      labels={{ show: t('corp.wallet.divisionsShow'), hide: t('corp.wallet.divisionsHide') }}
      collapsedSummary={
        selectedEntry ? (
          <>
            <p className="flex min-w-0 items-baseline justify-between gap-3">
              <span className={cx(eyebrowClassName, 'min-w-0 truncate')}>
                {divisionLabel(selectedEntry)}
              </span>
              <span
                className={`shrink-0 text-lg font-medium tabular-nums ${iskToneClass(selectedEntry.balance)}`}
              >
                {formatIsk(selectedEntry.balance, 2)}
              </span>
            </p>
            {offlineNote}
          </>
        ) : undefined
      }
    >
      {loading ? (
        <Spinner block="panel" label={t('common.loading')} />
      ) : !walletsResult ? (
        <LoadFailedState
          title={t('common.loadFailed.corpDivisions')}
          onRetry={onRetry}
          className="py-4"
        />
      ) : divisions.length === 0 ? (
        <EmptyState title={t('wallet.corpBalanceEmpty')} className="py-4" />
      ) : (
        <>
          <div
            role="group"
            aria-label={t('wallet.corpDivisionLabel')}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {shownDivisions.map((entry) => {
              const isSelected = entry.division === selected;
              return (
                <button
                  key={entry.division}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    onSelect(entry.division);
                    setExpanded(false);
                    toggleRef.current?.focus();
                  }}
                  className={cx(
                    'min-h-9 rounded-xs border border-line px-3 py-2 text-left',
                    interactiveClassName,
                    focusRingInsetClassName,
                    isSelected ? selectedRowClassName : 'hover:bg-panel-2 active:bg-panel'
                  )}
                >
                  <Tooltip content={divisionLabel(entry)}>
                    <span className={cx(eyebrowClassName, 'block truncate')}>
                      {divisionLabel(entry)}
                    </span>
                  </Tooltip>
                  <span
                    className={`block text-lg font-medium tabular-nums ${iskToneClass(entry.balance)}`}
                  >
                    {formatIsk(entry.balance, 2)}
                  </span>
                </button>
              );
            })}
          </div>
          {unused > 0 && (
            <p className="mt-2 text-xs text-text-dim">
              {t('corp.wallet.unusedDivisions', { count: unused })}
            </p>
          )}
          {offlineNote}
        </>
      )}
    </CollapsiblePanel>
  );
}

interface CorpJournalPanelProps {
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journal: readonly WalletJournalEntry[];
  loading: boolean;
  journalColumns: DataTableColumn<JournalRow>[];
  playerOptions: readonly PlayerOption[];
  playerNameFor: (entry: JournalRow) => string;
  linkFor: (entry: JournalRow) => WalletTransactionCommon | undefined;
  nameFor: (typeId: number) => string;
  filter: WalletJournalFilter;
  rowsFilter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  divisionQualifier: string | undefined;
  refreshFailed: boolean;
  onRetry: () => void;
  iskPanelOpen: boolean;
  onIskPanelOpenChange: (open: boolean) => void;
  highlightRowKey: number | null;
}

function CorpJournalPanel({
  journalResult,
  journal,
  loading,
  journalColumns,
  playerOptions,
  playerNameFor,
  linkFor,
  nameFor,
  filter,
  rowsFilter,
  onFilterChange,
  sort,
  onSortChange,
  divisionQualifier,
  refreshFailed,
  onRetry,
  iskPanelOpen,
  onIskPanelOpenChange,
  highlightRowKey,
}: CorpJournalPanelProps) {
  const { t } = useTranslation();
  const { filteredJournal, breakdownJournal, chartJournal, refTypeOptions } =
    useJournalFilterResult(journal, rowsFilter);
  const journalCsvColumns = useMemo(
    () => walletJournalCsvColumns(t, { playerName: playerNameFor, fills: { linkFor, nameFor } }),
    [t, playerNameFor, linkFor, nameFor]
  );
  const journalExport = useTableExport({
    surface: 'corp-wallet-journal',
    rows: filteredJournal,
    columns: journalCsvColumns,
    truncated: journalResult?.truncated ?? false,
    qualifier: divisionQualifier,
  });

  return (
    <Panel
      padded={false}
      title={t('wallet.journalTab')}
      actions={
        journalResult ? (
          <span className="flex items-center gap-2">
            <TableActionsMenu name={t('wallet.journalTab')} tableExport={journalExport} />
            <DataAgeBadge date={journalResult.fetchedAt} expiresAt={journalResult.expiresAt} />
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <Spinner block="panel" label={t('common.loading')} />
      ) : journalResult === null ? (
        <LoadFailedState
          title={t('common.loadFailed.corpJournal')}
          onRetry={onRetry}
          className="py-8"
        />
      ) : journal.length === 0 ? (
        <EmptyState
          title={t('wallet.corpJournalEmptyTitle')}
          hint={t('wallet.corpJournalEmptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {journalResult.fromCache && (
            <CachedNotice
              withBadge
              className="px-3 pt-2"
              fetchedAt={journalResult.fetchedAt}
              refreshFailed={refreshFailed}
            />
          )}
          {journalResult.truncated && (
            <IncompleteNotice className="px-3 pt-2" hint={t('wallet.journalTruncatedHint')} />
          )}
          <JournalTable
            filter={filter}
            onFilterChange={onFilterChange}
            refTypeOptions={refTypeOptions}
            playerOptions={playerOptions}
            filteredJournal={filteredJournal}
            breakdownJournal={breakdownJournal}
            chartJournal={chartJournal}
            journalColumns={journalColumns}
            label={t('wallet.journalTab')}
            highlightRowKey={highlightRowKey}
            sort={sort}
            onSortChange={onSortChange}
            tableExport={journalExport}
            panel={{
              open: iskPanelOpen,
              onOpenChange: onIskPanelOpenChange,
              scopeLabel: t('character.scope.corp', { division: divisionQualifier ?? '' }),
            }}
          />
        </>
      )}
    </Panel>
  );
}

function CorpWalletView({ canReadDivisions }: { canReadDivisions: boolean }) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationIdState = useActiveCorporationIdState();
  const corporationId = corporationIdState ?? null;
  const corpPending = corporationIdState === undefined;
  const [iskPanelOpen, setIskPanelOpen] = useState(false);

  const itemActions = usePageItemActions({ activeCharacterId });

  const corpKey =
    activeCharacterId !== null && corporationId !== null
      ? `${activeCharacterId}:${corporationId}`
      : null;

  const corpBalances = useCorpSnapshot<CorpBalancesSnapshot | null>(
    corpKey,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorpBalances(activeCharacterId, corporationId, canReadDivisions),
    { name: 'corp-wallet:balances', characterId: activeCharacterId }
  );

  const divisions = useMemo<WalletDivision[]>(
    () =>
      walletDivisions(
        corpBalances.data?.walletsResult.cached?.data ?? [],
        corpBalances.data?.divisionsResult.cached?.data ?? null
      ),
    [corpBalances.data]
  );

  const highlightedEntry = useHighlightParam();
  const [division, setDivision] = useUrlParam('division', DIVISION_PARAM);
  const effectiveDivision = divisions.some((entry) => entry.division === division)
    ? division
    : (divisions[0]?.division ?? division);
  const selectedDivision = divisions.find((entry) => entry.division === effectiveDivision) ?? null;

  const divisionKey = corpKey !== null ? `${corpKey}:${effectiveDivision}` : null;
  const corpJournal = useCorpSnapshot<CorpJournalSnapshot | null>(
    divisionKey,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorpJournal(activeCharacterId, corporationId, effectiveDivision),
    { name: 'corp-wallet:journal', characterId: activeCharacterId }
  );

  const corpTransactions = useCorpSnapshot<CorpTransactionsSnapshot | null>(
    divisionKey,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorpTransactions(activeCharacterId, corporationId, effectiveDivision),
    { name: 'corp-wallet:transactions', characterId: activeCharacterId }
  );

  const divisionLabel = (entry: WalletDivision) =>
    entry.name ?? t('wallet.corpDivisionFallback', { division: entry.division });
  const divisionQualifier = selectedDivision ? divisionLabel(selectedDivision) : undefined;

  const handleRefresh = () => {
    corpBalances.refresh();
    corpJournal.refresh();
    corpTransactions.refresh();
  };

  const corpTransactionsResult = corpTransactions.data?.transactionsResult.cached ?? null;
  const corpTransactionRows = corpTransactionsResult?.data ?? EMPTY_TRANSACTIONS;
  const corpTypeNames = corpTransactions.data?.typeNames ?? NO_NAMES;
  const nameForType = useMemo(() => typeNameLookup(corpTypeNames), [corpTypeNames]);
  const linkFor = useMemo(
    () => journalTransactionLinks(corpTransactionRows),
    [corpTransactionRows]
  );
  const corpJournalResult = corpJournal.data?.journalResult.cached ?? null;
  const playerNames = corpJournal.data?.playerNames ?? NO_NAMES;
  const playerIds = corpJournal.data?.playerIds ?? NO_IDS;
  const playerNameFor = useCallback(
    (entry: JournalRow) =>
      entry.playerId === undefined ? '' : (playerNames.get(entry.playerId) ?? `#${entry.playerId}`),
    [playerNames]
  );
  const stampedJournal = useMemo<JournalRow[]>(
    () =>
      (corpJournalResult?.data ?? EMPTY_JOURNAL).map((entry) => ({
        ...entry,
        playerId: journalPlayerId(entry, (partyId) => playerIds.has(partyId)),
      })),
    [corpJournalResult, playerIds]
  );
  const playerOptions = useMemo<PlayerOption[]>(
    () =>
      [...new Set(stampedJournal.map((entry) => entry.playerId))]
        .filter((id): id is number => id !== undefined)
        .map((id) => ({ id: String(id), name: playerNames.get(id) ?? `#${id}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [stampedJournal, playerNames]
  );
  const buildJournalColumns = useJournalColumnsBuilder();
  const journalColumns = useMemo(
    () => buildJournalColumns(linkFor, nameForType, undefined, undefined, playerNameFor),
    [buildJournalColumns, linkFor, nameForType, playerNameFor]
  );

  const filterScope = `division:${division}`;
  const [urlJournalFilter, setJournalFilter, urlJournalRowsFilter] =
    useUrlFilter<WalletJournalFilter>(
      filterScope,
      JOURNAL_FILTER_PARAMS,
      JOURNAL_FIELD_TO_PARAM,
      EMPTY_JOURNAL_FILTER_PARAMS
    );
  const journalFilter = useMemo(() => ({ ...urlJournalFilter, party: null }), [urlJournalFilter]);
  const journalRowsFilter = useMemo(
    () => ({ ...urlJournalRowsFilter, party: null }),
    [urlJournalRowsFilter]
  );
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  return (
    <ItemActionsProvider page={itemActions}>
      <div className={cx('mx-auto max-w-page space-y-4', iskPanelOpen && 'md:mr-[26rem] md:ml-0')}>
        <PageHeader
          title={t('corp.wallet.title')}
          actions={
            <IconButton
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={handleRefresh}
              busy={corpBalances.loading || corpJournal.loading || corpTransactions.loading}
            />
          }
        />

        <CorpDivisionsPanel
          balances={corpBalances.data}
          loading={corpPending || (corpBalances.loading && corpBalances.data === null)}
          divisions={divisions}
          selected={effectiveDivision}
          onSelect={setDivision}
          divisionLabel={divisionLabel}
          refreshFailed={corpBalances.refreshCount > 0}
          onRetry={corpBalances.refresh}
        />

        <CorpJournalPanel
          journalResult={corpJournalResult}
          journal={stampedJournal}
          loading={corpPending || (corpJournal.loading && corpJournal.data === null)}
          journalColumns={journalColumns}
          playerOptions={playerOptions}
          playerNameFor={playerNameFor}
          linkFor={linkFor}
          nameFor={nameForType}
          filter={journalFilter}
          rowsFilter={journalRowsFilter}
          onFilterChange={setJournalFilter}
          sort={journalSortProps.sort}
          onSortChange={journalSortProps.onSortChange}
          divisionQualifier={divisionQualifier}
          refreshFailed={corpJournal.refreshCount > 0}
          onRetry={corpJournal.refresh}
          iskPanelOpen={iskPanelOpen}
          onIskPanelOpenChange={setIskPanelOpen}
          highlightRowKey={highlightedEntry}
        />
      </div>
    </ItemActionsProvider>
  );
}

export function CorpWallet() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadWallet);

  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader title={t('corp.wallet.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.wallet.noAccessTitle')}
          hint={t('corp.wallet.noAccessHint')}
          roleLine={t('corp.wallet.roleLine')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <CorpWalletView
        key={String(gate.capabilities.canReadDivisions)}
        canReadDivisions={gate.capabilities.canReadDivisions}
      />
    ) : null;

  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
