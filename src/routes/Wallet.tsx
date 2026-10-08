import { useCallback, useEffect, useMemo, useState } from 'react';
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
  PageHeader,
  Panel,
  Spinner,
  RowCaret,
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { GrantBanner } from '@/app/GrantNote';
import { db } from '@/db';
import { miningTaxPaymentHref } from '@/features/miningTax/paymentDeepLink';
import { linkedRefIds } from '@/features/miningTax/paymentLinks';
import {
  loadWalletBalanceWithStatus,
  loadWalletJournalWithStatus,
  loadWalletTransactions,
  loadAllCharactersWalletBalances,
  type WalletBalancesSnapshot,
} from '@/features/character/wallet';
import { LpStorePicker } from '@/features/loyalty/LpStorePicker';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { WalletOriginCrumb } from '@/features/character/WalletOriginCrumb';
import {
  useResolvedCharacterFilter,
  fromStoredCharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { loadCharacterLoyaltyPoints, splitEverMarks } from '@/features/character/loyalty';
import { resolveNames } from '@/features/character/names';
import type { CachedResult } from '@/esi/cache';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlFilter, useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { WALLET_TABS } from '@/app/pageTabs';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { loadTypeNames } from '@/features/character/typeNames';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import { FromWalletCrumb } from '@/features/netWorth/FromWalletCrumb';
import { NetWorthPanel } from '@/features/netWorth/NetWorthPanel';
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
import { intParam } from '@/lib/urlState';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
/** Stable identity, so a missing journal doesn't invalidate its dependent memos every render. */
const EMPTY_JOURNAL: readonly WalletJournalEntry[] = [];
/** Same, for the personal fills the journal links its market lines to. */
const EMPTY_FILLS: readonly WalletTransactionCommon[] = [];

/**
 * `?drill=<id>`: the Character the net worth view is drilled into; 0 = none. Not
 * `?character=`: that param is the alert deep link, which `AlertCharacterSwitch`
 * strips and turns into an active-Character switch.
 */
const DRILL_PARAM = intParam(0);
const LOYALTY_SORT = { columnId: 'points', direction: 'desc' } as const;

interface Snapshot {
  balanceResult: CachedResult<number> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  balanceNeedsReauth: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  journalNeedsReauth: boolean;
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
  const [balanceStatus, journalStatus, loyaltyStatus] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadWalletJournalWithStatus(characterId),
    loadCharacterLoyaltyPoints(characterId),
  ]);
  const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
  const { cached: loyaltyResult, needsReauth: loyaltyNeedsReauth } = loyaltyStatus;
  const { cached: journalResult, needsReauth: journalNeedsReauth } = journalStatus;
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
    journalNeedsReauth,
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
  /** The fetch stopped at its page cap: older journal lines stay unnamed. */
  truncated: boolean;
}

async function loadPersonalFills(characterId: number): Promise<PersonalFillsSnapshot> {
  const result = await loadWalletTransactions(characterId);
  const transactions = result?.data ?? [];
  const typeNames = await loadTypeNames([...new Set(transactions.map((txn) => txn.type_id))]);
  return { transactions, typeNames, truncated: result?.truncated ?? false };
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
  const navigate = useNavigate();
  const location = useLocation();
  const viewedCharacterId = useViewedCharacterId();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadWalletSnapshot, viewedCharacterId, { cacheKey: 'wallet' });

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

  // A Character named in the URL is the one page subject: the balance panel
  // follows it rather than a stored "all" default.
  const resolvedWalletFilter = useResolvedCharacterFilter(
    viewedCharacterId === undefined ? walletCharacterFilter : 'current',
    activeCharacterId
  );
  const showingAllWalletBalances =
    resolvedWalletFilter === 'all' ||
    resolvedWalletFilter.size !== 1 ||
    !resolvedWalletFilter.has(activeCharacterId ?? -1);

  // Drilling into one Character is route state, so the browser Back button undoes it.
  const [drilledId, setDrilledId] = useUrlParam('drill', DRILL_PARAM);
  const drillInto = useCallback((id: number) => setDrilledId(id, { push: true }), [setDrilledId]);
  const leaveDrill = useCallback(() => setDrilledId(0, { push: true }), [setDrilledId]);

  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const activeCharacter = allCharacters?.find((c) => c.characterId === activeCharacterId);
  const drilledCharacter = allCharacters?.find((c) => c.characterId === drilledId);
  const drilledCharacters = useMemo(
    () =>
      drilledCharacter
        ? [{ characterId: drilledCharacter.characterId, name: drilledCharacter.name }]
        : [],
    [drilledCharacter]
  );
  const activeCharacters = useMemo(
    () =>
      activeCharacter
        ? [{ characterId: activeCharacter.characterId, name: activeCharacter.name }]
        : [],
    [activeCharacter]
  );
  const multiCharacters = useMemo(
    () =>
      (allCharacters ?? [])
        .filter((c) => resolvedWalletFilter === 'all' || resolvedWalletFilter.has(c.characterId))
        .map((c) => ({ characterId: c.characterId, name: c.name })),
    [allCharacters, resolvedWalletFilter]
  );
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
        characterCount={walletFilterCandidates.length}
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
    if (!showingAllWalletBalances && !drilledCharacter) return;
    let cancelled = false;
    void loadAllCharactersWalletBalances().then((snapshot) => {
      if (!cancelled) setWalletBalancesSnapshot(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [showingAllWalletBalances, drilledCharacter, walletBalancesRefreshCount]);
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
  const journalNeedsReauth = data?.journalNeedsReauth ?? false;
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
    const dates = [
      balanceResult?.fetchedAt,
      loyaltyNeedsReauth ? undefined : loyaltyResult?.fetchedAt,
    ].filter((d): d is Date => d != null);
    return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
  }, [balanceResult, loyaltyResult, loyaltyNeedsReauth]);

  const loyaltyColumns = useMemo<DataTableColumn<CharacterLoyaltyPoints>[]>(
    () => [
      {
        id: 'corporation',
        header: t('loyalty.corporation'),
        // The row navigates to the LP Store (§6c): the name is its accent
        // link, the caret column closes the row. Show Info for the corporation
        // is on the LP Store page header.
        render: (entry) => (
          <Link
            to={`/market/lp-store/${entry.corporation_id}`}
            className={entityLinkClassName('group')}
          >
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
      {
        id: 'go',
        header: '',
        align: 'right',
        render: () => <RowCaret />,
      },
    ],
    [t, corporationNames]
  );
  const loyaltySortProps = useUrlSort(
    'loyalty.sort',
    LOYALTY_SORT,
    loyaltyColumns.map((column) => column.id)
  );

  const personalTransactions = personalFills.data?.transactions ?? EMPTY_FILLS;
  const personalTypeNames = personalFills.data?.typeNames ?? NO_NAMES;
  const itemNamesTruncated = personalFills.data?.truncated ?? false;
  const personalLinkFor = useMemo(
    () => journalTransactionLinks(personalTransactions),
    [personalTransactions]
  );
  const personalNameFor = useMemo(() => typeNameLookup(personalTypeNames), [personalTypeNames]);
  // Journal lines a pilot linked to a Moon Mining Tax payment get a way back
  // to the tax row they settled. Every character's Assignments, since the
  // journal can show any of them.
  const taxLinks = useLiveQuery(
    async () => linkedRefIds(await db.miningTaxAssignments.toArray()),
    [],
    undefined
  );
  const miningTaxHrefFor = useCallback(
    (entry: WalletJournalEntry) => {
      if (!taxLinks) return undefined;
      if (taxLinks.journal.has(entry.id)) {
        return miningTaxPaymentHref({ kind: 'journal', id: entry.id });
      }
      if (
        entry.context_id_type === 'contract_id' &&
        entry.context_id !== undefined &&
        taxLinks.contract.has(entry.context_id)
      ) {
        return miningTaxPaymentHref({ kind: 'contract', id: entry.context_id });
      }
      return undefined;
    },
    [taxLinks]
  );
  const buildJournalColumns = useJournalColumnsBuilder();
  const journalColumns = useMemo(
    () => buildJournalColumns(personalLinkFor, personalNameFor, miningTaxHrefFor),
    [buildJournalColumns, personalLinkFor, personalNameFor, miningTaxHrefFor]
  );

  // Unsorted: `DataTable`'s own controlled `sort` below is the one place
  // these rows get ordered — sorting here too was a redundant second pass
  // over the same array on every render (issue #413). Export reads the
  // table's sorted rows, so it follows the same order.
  const journal = journalResult?.data ?? EMPTY_JOURNAL;

  // In the URL (`journal.*`, issue #1302).
  const [journalFilter, setJournalFilter, journalRowsFilter] = useUrlFilter<WalletJournalFilter>(
    'personal',
    JOURNAL_FILTER_PARAMS,
    JOURNAL_FIELD_TO_PARAM,
    EMPTY_JOURNAL_FILTER_PARAMS
  );
  const liveWallet = useMemo(() => {
    const map = new Map<number, { balance: number | null; needsReauth: boolean }>();
    for (const entry of walletBalancesSnapshot?.entries ?? []) {
      map.set(entry.characterId, {
        balance: entry.balanceResult?.data ?? null,
        needsReauth: entry.needsReauth,
      });
    }
    // The page already holds the active Character's own balance.
    if (activeCharacterId !== null && !map.has(activeCharacterId)) {
      map.set(activeCharacterId, {
        balance: balanceResult?.data ?? null,
        needsReauth: balanceNeedsReauth,
      });
    }
    return map;
  }, [walletBalancesSnapshot, activeCharacterId, balanceResult, balanceNeedsReauth]);
  const { filteredJournal, breakdownJournal, refTypeOptions } = useJournalFilterResult(
    journal,
    journalRowsFilter
  );
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  // Each table's title-bar export button and its row menus export the same rows, in
  // the order the table shows them.
  const journalCsvColumns = useMemo(() => walletJournalCsvColumns(t), [t]);
  const journalExport = useTableExport({
    surface: 'wallet-journal',
    rows: filteredJournal,
    columns: journalCsvColumns,
    truncated: journalTruncated,
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
      {tab === 'journal' && <FromWalletCrumb />}
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
          {drilledCharacter ? (
            <NetWorthPanel
              mode="single"
              drilled
              characters={drilledCharacters}
              liveWallet={liveWallet}
              filterMeta={walletCharacterFilterMeta}
              onDrill={drillInto}
              onBack={leaveDrill}
            />
          ) : showingAllWalletBalances ? (
            <NetWorthPanel
              mode="multi"
              characters={multiCharacters}
              liveWallet={liveWallet}
              filterMeta={walletCharacterFilterMeta}
              onDrill={drillInto}
              onBack={leaveDrill}
              actions={
                <IconButton
                  size="sm"
                  icon={<Icon.Refresh />}
                  label={t('wallet.refresh')}
                  onClick={refreshWalletBalances}
                  disabled={walletBalancesLoading}
                />
              }
            />
          ) : (
            <>
              <NetWorthPanel
                mode="single"
                characters={activeCharacters}
                liveWallet={liveWallet}
                filterMeta={walletCharacterFilterMeta}
                onDrill={drillInto}
                onBack={leaveDrill}
                stats={
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
                }
                notices={
                  <>
                    {balanceNeedsReauth && (
                      <div className="mt-3">
                        <GrantBanner
                          characterId={activeCharacterId}
                          endpoints={['getCharacterWallet']}
                          title={t('wallet.reauthTitle')}
                          hint={t('wallet.reauthHint')}
                          actionLabel={t('wallet.reauthAction')}
                        />
                      </div>
                    )}
                    {(balanceResult?.fromCache || loyaltyResult?.fromCache) && (
                      <p className="mt-3 text-[0.6875rem] text-warning uppercase">
                        {t(offlineTitleKey)}
                      </p>
                    )}
                    {journalNeedsReauth ? (
                      <div className="mt-4">
                        <GrantBanner
                          characterId={activeCharacterId}
                          endpoints={['getCharacterWalletJournal']}
                          title={t('wallet.reauthTitle')}
                          hint={t('wallet.reauthHint')}
                          actionLabel={t('wallet.reauthAction')}
                        />
                      </div>
                    ) : (
                      journalTruncated && (
                        <p className="mt-4 px-1 text-[0.6875rem] text-warning uppercase">
                          {t('common.incompleteTitle')} — {t('wallet.journalTruncatedHint')}
                        </p>
                      )
                    )}
                  </>
                }
              />
            </>
          )}

          <Panel
            // Lifts this panel's stacking context over the next one, so the
            // picker's popover isn't painted under it.
            className="relative z-10"
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
                rowClassName={() => 'group'}
                onRowClick={(entry) => navigate(`/market/lp-store/${entry.corporation_id}`)}
              />
            )}
          </Panel>
        </div>
      ) : (
        <Panel
          padded={false}
          title={t('wallet.journalTab')}
          meta={<WalletOriginCrumb />}
          actions={
            <span className="flex items-center gap-2">
              <Link
                to="/market/history/transactions"
                className={cx(
                  'inline-flex min-h-11 min-w-11 items-center justify-center text-xs md:min-h-0 md:min-w-0',
                  inlineLinkClassName
                )}
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
          {journalNeedsReauth ? (
            <div className="p-3">
              <GrantBanner
                characterId={activeCharacterId}
                endpoints={['getCharacterWalletJournal']}
                title={t('wallet.reauthTitle')}
                hint={t('wallet.reauthHint')}
                actionLabel={t('wallet.reauthAction')}
              />
            </div>
          ) : !journalResult || journal.length === 0 ? (
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
              {itemNamesTruncated && (
                <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
                  {t('wallet.journalItemNamesCappedHint')}
                </p>
              )}
              <JournalTable
                filter={journalFilter}
                onFilterChange={setJournalFilter}
                refTypeOptions={refTypeOptions}
                filteredJournal={filteredJournal}
                breakdownJournal={breakdownJournal}
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
