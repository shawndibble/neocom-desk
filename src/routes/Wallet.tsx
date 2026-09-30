import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  IconButton,
  InfoTooltip,
  MenuItem,
  PageHeader,
  Panel,
  Spinner,
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { db } from '@/db';
import {
  loadWalletBalanceWithStatus,
  loadWalletJournal,
  loadWalletTransactions,
  loadAllCharactersWalletBalances,
  totalWalletBalance,
  type CharacterWalletBalance,
  type WalletBalancesSnapshot,
} from '@/features/character/wallet';
import { LpStorePicker } from '@/features/loyalty/LpStorePicker';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CorpHistoryContextMenu } from '@/features/character/CorpHistoryContextMenu';
import {
  useResolvedCharacterFilter,
  fromStoredCharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { loadCharacterLoyaltyPoints, splitEverMarks } from '@/features/character/loyalty';
import { resolveNames } from '@/features/character/names';
import type { CachedResult } from '@/esi/cache';
import { iskToneClass } from '@/features/character/format';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlFilter, useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { WALLET_TABS } from '@/app/pageTabs';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { loadTypeNames } from '@/features/character/typeNames';
import { formatIsk } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import { walletBalancesCsvColumns } from '@/features/character/walletBalancesCsv';
import { loyaltyPointsCsvColumns } from '@/features/character/loyaltyPointsCsv';
import { journalTransactionLinks } from '@/features/character/journalTransactionLink';
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
import { JournalTable } from '@/features/character/WalletJournalTable';
import type {
  CharacterLoyaltyPoints,
  WalletJournalEntry,
  WalletTransactionCommon,
} from '@/esi/endpoints';
import { walletBalanceHistory, walletBalanceTrend } from '@/engine/wallet/balanceHistory';

/**
 * Dynamic import, not a static one: `WalletBalanceChart.tsx` statically
 * imports Recharts, so this is the boundary that keeps the library out of
 * the initial page bundle — it only loads once the Balance tab actually
 * renders a chart (see `market/PriceHistoryChart.tsx`'s bundle-size
 * precedent).
 */
const LazyWalletBalanceChart = lazy(() => import('@/features/character/WalletBalanceChart'));

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
/** Stable identity, so a missing journal doesn't invalidate its dependent memos every render. */
const EMPTY_JOURNAL: readonly WalletJournalEntry[] = [];
/** Same, for the personal fills the journal links its market lines to. */
const EMPTY_FILLS: readonly WalletTransactionCommon[] = [];

const BALANCE_SORT = { columnId: 'character', direction: 'asc' } as const;
const LOYALTY_SORT = { columnId: 'points', direction: 'desc' } as const;

interface Snapshot {
  balanceResult: CachedResult<number> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  balanceNeedsReauth: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  journalTruncated: boolean;
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  loyaltyNeedsReauth: boolean;
  corporationNames: Map<number, string>;
}

async function loadWalletSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [balanceStatus, journalResult, loyaltyStatus] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadWalletJournal(characterId),
    loadCharacterLoyaltyPoints(characterId),
  ]);
  const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
  const { cached: loyaltyResult, needsReauth: loyaltyNeedsReauth } = loyaltyStatus;
  const journalTruncated = journalResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const corporationIds = signal.cancelled
    ? []
    : (loyaltyResult?.data ?? []).map((entry) => entry.corporation_id);
  const corporationNames = await resolveNames(corporationIds);
  return {
    balanceResult,
    balanceNeedsReauth,
    journalResult,
    journalTruncated,
    loyaltyResult,
    loyaltyNeedsReauth,
    corporationNames,
  };
}

/**
 * The Character's recent fills, read only so a journal line can name the item
 * behind it (the fills themselves are listed on Market's History ›
 * Transactions view). Its own load, not part of `loadWalletSnapshot`: the
 * Balance tab would otherwise wait on a cursor walk it never shows.
 */
interface PersonalFillsSnapshot {
  transactions: readonly WalletTransactionCommon[];
  typeNames: Map<number, string>;
}

async function loadPersonalFills(characterId: number): Promise<PersonalFillsSnapshot> {
  const transactions = (await loadWalletTransactions(characterId))?.data ?? [];
  const typeNames = await loadTypeNames([...new Set(transactions.map((txn) => txn.type_id))]);
  return { transactions, typeNames };
}

/**
 * Wallet: the pilot's own ISK — balance and journal, for the active Character
 * or every Character (`?char=`). Read-only, cached for offline. Recent
 * transactions moved to Market's History › Transactions view, and the
 * corporation's wallet lives on `/corp/wallet` (it was a Personal /
 * Corporation switch here once — see `routes/CorpWallet.tsx`).
 */
export function Wallet() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadWalletSnapshot, undefined, { cacheKey: 'wallet' });

  // A notification's `walletBalanceChanged` deep link (`notificationOptions.ts`)
  // names the tab as a path segment (`/wallet/journal`) — the `Tabs`
  // control's own switch is a history push the same way any other tab
  // switch is (ADR 0015, issue #1302).
  const [tab, setTab] = usePageTab(WALLET_TABS);
  // The journal line a `walletBalanceChanged` alert pointed at, if any.
  const highlightedEntryId = useHighlightParam();

  /**
   * The cross-character Balance view (issue #607): `'current'` by default —
   * today's exact behavior, no extra fan-out, and it keeps following the
   * active Character across a switch with no resync logic of its own
   * (`useResolvedCharacterFilter` re-resolves it whenever the active
   * Character changes) — or `'all'` once the pilot asks via
   * `CharacterFilterControl`.
   *
   * Lives in the `?char=` query param (issue #1302), so it survives a reload
   * and a pasted link — the codec's own default is the synced setting below,
   * rebuilt in a `useMemo` whenever that setting changes, so an absent param
   * reads as whatever Settings' Defaults panel says until the URL overrides
   * it for this view. Nothing read from the URL is ever written back to the
   * setting.
   */
  const defaultCharacterFilter = useDefaultCharacterFilter((state) => state.value);
  const hydrateDefaultCharacterFilter = useDefaultCharacterFilter((state) => state.hydrate);
  useEffect(() => {
    void hydrateDefaultCharacterFilter();
  }, [hydrateDefaultCharacterFilter]);
  const characterFilterCodec = useMemo(
    () => characterFilterParam(fromStoredCharacterFilterValue(defaultCharacterFilter)),
    [defaultCharacterFilter]
  );
  const [walletCharacterFilter, setWalletCharacterFilter] = useUrlParam(
    'char',
    characterFilterCodec
  );

  const resolvedWalletFilter = useResolvedCharacterFilter(walletCharacterFilter, activeCharacterId);
  const showingAllWalletBalances =
    resolvedWalletFilter === 'all' ||
    resolvedWalletFilter.size !== 1 ||
    !resolvedWalletFilter.has(activeCharacterId ?? -1);

  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const walletFilterCandidates = useMemo(
    () => (allCharacters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [allCharacters]
  );
  /**
   * The Balance panel's `meta`, so the picker rides in the panel's own title
   * bar instead of a bare row floating above it — and so it survives the swap
   * between the single-Character panel and the per-Character table below,
   * which are two different `Panel`s (`ActiveJobsPanel`'s placement).
   *
   * Absent for a one-Character account: "This character" and "All characters"
   * then resolve to the same pilot, leaving a control that cannot change
   * anything (`OpenOrdersPanel`'s `showCharacterStrip` precedent).
   */
  const walletCharacterFilterMeta =
    walletFilterCandidates.length > 1 ? (
      <CharacterFilterControl
        activeCharacterId={activeCharacterId}
        value={walletCharacterFilter}
        onChange={setWalletCharacterFilter}
      />
    ) : undefined;

  // Nothing fetched until the Character filter actually asks for more than
  // the active Character. No separate "loading" state: `walletBalancesSnapshot
  // === null` already means "nothing to show yet," and a manual refresh
  // deliberately leaves the previous snapshot in place while it re-fetches —
  // same retained-snapshot idiom `useRouteSnapshot`/`useCorpSnapshot` use
  // elsewhere in this app, and the only way to give the effect below no
  // synchronous `setState` call of its own (`react-hooks/set-state-in-effect`).
  const [walletBalancesSnapshot, setWalletBalancesSnapshot] =
    useState<WalletBalancesSnapshot | null>(null);
  const [walletBalancesRefreshCount, setWalletBalancesRefreshCount] = useState(0);
  useEffect(() => {
    if (!showingAllWalletBalances) return;
    let cancelled = false;
    void loadAllCharactersWalletBalances().then((snapshot) => {
      if (!cancelled) setWalletBalancesSnapshot(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [showingAllWalletBalances, walletBalancesRefreshCount]);
  const refreshWalletBalances = useCallback(
    () => setWalletBalancesRefreshCount((count) => count + 1),
    []
  );
  const walletBalancesLoading = walletBalancesSnapshot === null;

  // Opt-in: fetched only once the Journal tab is open, and kept alive once
  // visited, so a tab toggle doesn't walk the cursor again.
  const personalFillsBaseKey = activeCharacterId !== null ? `${activeCharacterId}` : null;
  const [visitedFillsKey, setVisitedFillsKey] = useState<string | null>(null);
  if (
    tab === 'journal' &&
    personalFillsBaseKey !== null &&
    visitedFillsKey !== personalFillsBaseKey
  ) {
    setVisitedFillsKey(personalFillsBaseKey);
  }
  const personalFills = useCorpSnapshot<PersonalFillsSnapshot | null>(
    personalFillsBaseKey !== null && (tab === 'journal' || visitedFillsKey === personalFillsBaseKey)
      ? personalFillsBaseKey
      : null,
    async () => (activeCharacterId === null ? null : loadPersonalFills(activeCharacterId)),
    { name: 'wallet:personal-fills', characterId: activeCharacterId }
  );
  const handlePersonalRefresh = () => {
    refresh();
    personalFills.refresh();
  };

  // A manual Refresh that still falls back to cache is a more alarming case
  // than the initial load finding cache first — same banner, different copy.
  const offlineTitleKey = refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle';

  const balanceResult = data?.balanceResult ?? null;
  const balanceNeedsReauth = data?.balanceNeedsReauth ?? false;
  const journalResult = data?.journalResult ?? null;
  const journalTruncated = data?.journalTruncated ?? false;
  const loyaltyResult = data?.loyaltyResult ?? null;
  const loyaltyNeedsReauth = data?.loyaltyNeedsReauth ?? false;
  const corporationNames = data?.corporationNames ?? NO_NAMES;

  const { everMarks, otherLoyalty } = useMemo(
    () => splitEverMarks(loyaltyResult?.data ?? []),
    [loyaltyResult]
  );

  // One age for the page: the stalest of the two feeds it shows.
  const oldestFetchedAt = useMemo(() => {
    const dates = [balanceResult?.fetchedAt, loyaltyResult?.fetchedAt].filter(
      (d): d is Date => d != null
    );
    return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
  }, [balanceResult, loyaltyResult]);

  const loyaltyColumns = useMemo<DataTableColumn<CharacterLoyaltyPoints>[]>(
    () => [
      {
        id: 'corporation',
        header: t('loyalty.corporation'),
        // A real link as well as the row click: the row alone has no link
        // role or name, so keyboard and screen-reader users could not tell
        // it leads to the LP Store. DataTable ignores row clicks that land on
        // a link, so the two never double-navigate.
        render: (entry) => (
          <Link to={`/wallet/loyalty/${entry.corporation_id}`} className="hover:text-accent">
            {corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`}
          </Link>
        ),
        sortValue: (entry) =>
          corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`,
      },
      {
        id: 'points',
        header: t('loyalty.points'),
        align: 'right',
        className: 'tabular-nums font-semibold',
        render: (entry) => entry.loyalty_points.toLocaleString(),
        sortValue: (entry) => entry.loyalty_points,
      },
    ],
    [t, corporationNames]
  );
  const loyaltySortProps = useUrlSort(
    'loyalty.sort',
    LOYALTY_SORT,
    loyaltyColumns.map((column) => column.id)
  );

  const walletBalanceColumns = useMemo<DataTableColumn<CharacterWalletBalance>[]>(
    () => [
      {
        id: 'character',
        header: t('wallet.balanceCharacterColumn'),
        primary: true,
        sortValue: (row) => row.characterName,
        render: (row) => row.characterName,
      },
      {
        id: 'balance',
        header: t('wallet.isk'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => (row.needsReauth ? -Infinity : (row.balanceResult?.data ?? -Infinity)),
        render: (row) =>
          row.needsReauth ? (
            <span className="text-warning">{t('wallet.reauthTitle')}</span>
          ) : row.balanceResult ? (
            <span className={iskToneClass(row.balanceResult.data)}>
              {formatIsk(row.balanceResult.data, 2)}
            </span>
          ) : (
            t('common.unknown')
          ),
      },
    ],
    [t]
  );
  const balanceSortProps = useUrlSort(
    'balance.sort',
    BALANCE_SORT,
    walletBalanceColumns.map((column) => column.id)
  );

  const personalTransactions = personalFills.data?.transactions ?? EMPTY_FILLS;
  const personalTypeNames = personalFills.data?.typeNames ?? NO_NAMES;
  const personalLinkFor = useMemo(
    () => journalTransactionLinks(personalTransactions),
    [personalTransactions]
  );
  const personalNameFor = useMemo(() => typeNameLookup(personalTypeNames), [personalTypeNames]);
  const buildJournalColumns = useJournalColumnsBuilder();
  const journalColumns = useMemo(
    () => buildJournalColumns(personalLinkFor, personalNameFor),
    [buildJournalColumns, personalLinkFor, personalNameFor]
  );

  // Unsorted: `DataTable`'s own controlled `sort` below is the one place
  // these rows get ordered — sorting here too was a redundant second pass
  // over the same array on every render (issue #413). Export reads the
  // table's sorted rows, so it follows the same order.
  const journal = journalResult?.data ?? EMPTY_JOURNAL;
  const walletBalancePoints = useMemo(() => walletBalanceHistory(journal), [journal]);
  const walletBalanceTrendDirection = useMemo(
    () => walletBalanceTrend(walletBalancePoints),
    [walletBalancePoints]
  );

  // In the URL (`journal.*`, issue #1302).
  const [journalFilter, setJournalFilter, journalRowsFilter] = useUrlFilter<WalletJournalFilter>(
    'personal',
    JOURNAL_FILTER_PARAMS,
    JOURNAL_FIELD_TO_PARAM,
    EMPTY_JOURNAL_FILTER_PARAMS
  );
  const { filteredJournal, refTypeOptions } = useJournalFilterResult(journal, journalRowsFilter);
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  const visibleWalletBalances = useMemo(() => {
    const entries = walletBalancesSnapshot?.entries ?? [];
    return resolvedWalletFilter === 'all'
      ? entries
      : entries.filter((entry) => resolvedWalletFilter.has(entry.characterId));
  }, [walletBalancesSnapshot, resolvedWalletFilter]);
  const walletBalancesTotal = useMemo(
    () => totalWalletBalance(visibleWalletBalances),
    [visibleWalletBalances]
  );
  // Narrowing to two of five Characters must not still show a "hasn't
  // shared" notice for one of the other three — same filter
  // `visibleWalletBalances` above already applies.
  const walletBalancesSkipped = useMemo(() => {
    const skipped = walletBalancesSnapshot?.skipped ?? [];
    return resolvedWalletFilter === 'all'
      ? skipped
      : skipped.filter((s) => resolvedWalletFilter.has(s.characterId));
  }, [walletBalancesSnapshot, resolvedWalletFilter]);

  // Each table's title-bar export button and its row menus export the same rows, in
  // the order the table shows them.
  const journalCsvColumns = useMemo(() => walletJournalCsvColumns(t), [t]);
  const journalExport = useTableExport({
    surface: 'wallet-journal',
    rows: filteredJournal,
    columns: journalCsvColumns,
    truncated: journalTruncated,
  });
  const walletBalancesCsv = useMemo(() => walletBalancesCsvColumns(t), [t]);
  const walletBalancesExport = useTableExport({
    surface: 'wallet-balances',
    rows: visibleWalletBalances,
    columns: walletBalancesCsv,
  });
  const loyaltyCsvColumns = useMemo(
    () => loyaltyPointsCsvColumns(t, (id) => corporationNames.get(id) ?? `#${id}`),
    [t, corporationNames]
  );
  const loyaltyExport = useTableExport({
    surface: 'loyalty-points',
    rows: otherLoyalty,
    columns: loyaltyCsvColumns,
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;
  // The corporation wallet was this page's Corporation side until it moved to
  // `/corp/wallet`. A bookmark or alert from then (`?owner=corporation`, with
  // its `?division=`) still lands on the same division there, and its old
  // Transactions tab on that page's Transactions view.
  if (new URLSearchParams(location.search).get('owner') === 'corporation') {
    const search = new URLSearchParams(location.search);
    search.delete('owner');
    if (tab === 'transactions') search.set('view', 'transactions');
    const query = search.toString();
    return <Navigate to={`/corp/wallet${query ? `?${query}` : ''}`} replace />;
  }
  // Personal transactions live under Market › History.
  if (tab === 'transactions') return <Navigate to="/market/history/transactions" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('wallet.title')}
        meta={oldestFetchedAt ? <DataAgeBadge date={oldestFetchedAt} /> : undefined}
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('wallet.refresh')}
            onClick={handlePersonalRefresh}
            disabled={loading || personalFills.loading}
          />
        }
      />

      {/*
        No Transactions entry: the Character's fills are Market's tab, and the
        corporation's are on `/corp/wallet` — an entry that switched pages
        would not be a tab.
      */}
      <Tabs
        label={t('wallet.title')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'balance', label: t('wallet.balanceTab') },
          { id: 'journal', label: t('wallet.journalTab') },
        ]}
      />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : tab === 'balance' ? (
        <div className="space-y-4">
          {/*
            The picker stays visible in both branches, even while pinned to
            "This character" — otherwise there is no way to discover the
            cross-character view at all (issue #607) — but it rides in each
            panel's own header rather than a row above them. The panel content
            swaps beneath it: unchanged for "This character", a per-character
            table + total for anything wider.
          */}
          {showingAllWalletBalances ? (
            <Panel
              padded={false}
              title={t('wallet.balanceByCharacter')}
              meta={walletCharacterFilterMeta}
              actions={
                <span className="flex items-center gap-2">
                  <IconButton
                    size="sm"
                    icon={<Icon.Refresh />}
                    label={t('wallet.refresh')}
                    onClick={refreshWalletBalances}
                    disabled={walletBalancesLoading}
                  />
                  <TableActionsMenu
                    name={t('wallet.balanceByCharacter')}
                    tableExport={walletBalancesExport}
                  />
                </span>
              }
            >
              {walletBalancesLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner label={t('common.loading')} />
                </div>
              ) : (
                <>
                  <p className="px-3 pt-2 text-xl font-medium tabular-nums">
                    {t('wallet.totalBalance')}:{' '}
                    <span className={iskToneClass(walletBalancesTotal)}>
                      {formatIsk(walletBalancesTotal, 2)}
                    </span>
                  </p>
                  {walletBalancesSkipped.length > 0 && (
                    <div className="space-y-1 px-3 pt-2">
                      {walletBalancesSkipped.map((s) => (
                        <p key={s.characterId} className="text-xs text-text-dim">
                          {s.name} — {t('wallet.balanceCharacterNotShared')}
                        </p>
                      ))}
                    </div>
                  )}
                  {visibleWalletBalances.length === 0 ? (
                    <EmptyState title={t('wallet.balanceEmpty')} className="py-8" />
                  ) : (
                    <DataTable
                      {...walletBalancesExport.tableProps}
                      label={t('wallet.balanceByCharacter')}
                      columns={walletBalanceColumns}
                      rows={visibleWalletBalances}
                      rowKey={(row) => row.characterId}
                      sort={balanceSortProps.sort}
                      onSortChange={balanceSortProps.onSortChange}
                    />
                  )}
                </>
              )}
            </Panel>
          ) : (
            <Panel title={t('wallet.balanceTab')} meta={walletCharacterFilterMeta}>
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <div>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('wallet.isk')}
                  </p>
                  {balanceNeedsReauth ? (
                    <GrantBanner
                      characterId={activeCharacterId}
                      endpoints={['getCharacterWallet']}
                      title={t('wallet.reauthTitle')}
                      hint={t('wallet.reauthHint')}
                      actionLabel={t('wallet.reauthAction')}
                    />
                  ) : balanceResult ? (
                    <p
                      className={`text-xl font-medium tabular-nums ${iskToneClass(balanceResult.data)}`}
                    >
                      {formatIsk(balanceResult.data, 2)}
                    </p>
                  ) : (
                    <EmptyState title={t('wallet.balanceEmpty')} className="py-4" />
                  )}
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('wallet.everMarks')}
                    <InfoTooltip
                      label={t('wallet.everMarksTooltipLabel')}
                      content={t('wallet.everMarksTooltip')}
                    />
                  </p>
                  <p className="text-xl font-medium tabular-nums">
                    {loyaltyResult && !loyaltyNeedsReauth
                      ? everMarks.toLocaleString()
                      : t('common.unknown')}
                  </p>
                </div>
              </div>
              {(balanceResult?.fromCache || loyaltyResult?.fromCache) && (
                <p className="mt-3 text-[0.6875rem] text-warning uppercase">{t(offlineTitleKey)}</p>
              )}
              {journal.length === 0 ? (
                <CachedEmptyState
                  result={journalResult}
                  title={t('wallet.journalEmptyTitle')}
                  hint={t('wallet.journalEmptyHint')}
                  fetchedTitle={t('wallet.journalEmptyFetchedTitle')}
                  className="py-8"
                />
              ) : (
                <div className="mt-4">
                  {journalTruncated && (
                    <p className="px-1 pb-2 text-[0.6875rem] text-warning uppercase">
                      {t('common.incompleteTitle')} — {t('wallet.journalTruncatedHint')}
                    </p>
                  )}
                  {walletBalancePoints.length > 0 && (
                    <Suspense
                      fallback={
                        <div className="flex justify-center py-8">
                          <Spinner label={t('common.loading')} />
                        </div>
                      }
                    >
                      <LazyWalletBalanceChart
                        points={walletBalancePoints}
                        trend={walletBalanceTrendDirection}
                        timeZone={timeZone}
                      />
                    </Suspense>
                  )}
                </div>
              )}
            </Panel>
          )}

          <Panel
            padded={false}
            title={t('loyalty.title')}
            actions={
              <span className="flex items-center gap-2">
                {/* Always shown, LP or not (issue #2321): the way into any
                    corp's store for a pilot who holds LP nowhere yet. */}
                <LpStorePicker corporationName={null} size="sm" className="w-44" />
                {loyaltyResult && !loyaltyNeedsReauth && otherLoyalty.length > 0 && (
                  <TableActionsMenu name={t('loyalty.title')} tableExport={loyaltyExport} />
                )}
              </span>
            }
          >
            {loyaltyNeedsReauth ? (
              <div className="p-3">
                <GrantBanner
                  characterId={activeCharacterId}
                  endpoints={['getCharacterLoyaltyPoints']}
                  title={t('loyalty.reauthTitle')}
                  hint={t('loyalty.reauthHint')}
                  actionLabel={t('loyalty.reauthAction')}
                />
              </div>
            ) : !loyaltyResult || otherLoyalty.length === 0 ? (
              <CachedEmptyState
                result={loyaltyResult}
                title={t('loyalty.emptyTitle')}
                hint={t('loyalty.emptyHint')}
                fetchedTitle={t('loyalty.emptyFetchedTitle')}
                className="py-8"
              />
            ) : (
              <DataTable
                {...loyaltyExport.tableProps}
                label={t('loyalty.title')}
                columns={loyaltyColumns}
                rows={otherLoyalty}
                rowKey={(entry) => entry.corporation_id}
                sort={loyaltySortProps.sort}
                onSortChange={loyaltySortProps.onSortChange}
                responsive="table"
                onRowClick={(entry) => navigate(`/wallet/loyalty/${entry.corporation_id}`)}
                rowMoreActions
                rowContextMenu={(entry, tr) => (
                  <CorpHistoryContextMenu
                    corporationId={entry.corporation_id}
                    name={corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`}
                    leadingItems={
                      <MenuItem
                        onSelect={() => navigate(`/wallet/loyalty/${entry.corporation_id}`)}
                      >
                        {t('loyalty.openStore')}
                      </MenuItem>
                    }
                  >
                    {tr}
                  </CorpHistoryContextMenu>
                )}
              />
            )}
          </Panel>
        </div>
      ) : (
        <Panel
          padded={false}
          title={t('wallet.journalTab')}
          actions={
            <span className="flex items-center gap-2">
              <Link
                to="/market/history/transactions"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-xs text-accent hover:underline md:min-h-0 md:min-w-0"
              >
                {t('wallet.transactionsLink')}
              </Link>
              {journalResult && (
                <>
                  <TableActionsMenu name={t('wallet.journalTab')} tableExport={journalExport} />
                  <DataAgeBadge date={journalResult.fetchedAt} />
                </>
              )}
            </span>
          }
        >
          {!journalResult || journal.length === 0 ? (
            <CachedEmptyState
              result={journalResult}
              title={t('wallet.journalEmptyTitle')}
              hint={t('wallet.journalEmptyHint')}
              fetchedTitle={t('wallet.journalEmptyFetchedTitle')}
              className="py-8"
            />
          ) : (
            <>
              {journalResult.fromCache && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t(offlineTitleKey)}
                </p>
              )}
              {journalTruncated && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('common.incompleteTitle')} — {t('wallet.journalTruncatedHint')}
                </p>
              )}
              <JournalTable
                filter={journalFilter}
                onFilterChange={setJournalFilter}
                refTypeOptions={refTypeOptions}
                filteredJournal={filteredJournal}
                journalColumns={journalColumns}
                label={t('wallet.journalTab')}
                sort={journalSortProps.sort}
                onSortChange={journalSortProps.onSortChange}
                highlightRowKey={highlightedEntryId}
                tableExport={journalExport}
              />
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
