import { NO_NAMES } from '@/lib/emptyCollections';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DataAgeBadge,
  EmptyState,
  IconButton,
  InfoTooltip,
  PageHeader,
  Spinner,
  RowCaret,
  TabPanel,
  Tabs,
  useTabsId,
  type DataTableColumn,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { GrantBanner } from '@/app/GrantNote';
import { db } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { miningTaxPaymentHref } from '@/features/miningTax/paymentDeepLink';
import { linkedRefIds } from '@/features/miningTax/paymentLinks';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { splitEverMarks } from '@/features/character/loyalty';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useRememberedUrlParams, useUrlFilter, useUrlSort } from '@/lib/useUrlState';
import { WALLET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useTableExport } from '@/components/ui/useTableExport';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import { FromWalletCrumb } from '@/features/netWorth/FromWalletCrumb';
import { NetWorthPanel } from '@/features/netWorth/NetWorthPanel';
import { loyaltyPointsCsvColumns } from '@/features/character/loyaltyPointsCsv';
import { classifyJournal, journalCoverage, type JournalLine } from '@/engine/journalNetting';
import {
  loadAllCharactersJournals,
  loadWalletScopedCharacterIds,
  type AllJournalsSnapshot,
} from '@/features/character/walletJournalAll';
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
import { WalletJournalPanel } from '@/features/character/WalletJournalPanel';
import { WalletLoyaltyPanel } from '@/features/character/WalletLoyaltyPanel';
import { useWalletBalances } from '@/features/character/useWalletBalances';
import { useWalletDrill } from '@/features/character/useWalletDrill';
import {
  EMPTY_FILLS,
  EMPTY_JOURNAL,
  loadPersonalFills,
  loadWalletSnapshot,
  type PersonalFillsSnapshot,
} from '@/features/character/walletSnapshot';
import type {
  CharacterLoyaltyPoints,
  WalletJournalEntry,
  WalletTransactionCommon,
} from '@/esi/endpoints';

const WALLET_CHARACTER_PARAMS = { char: characterFilterParam('current') };
const LOYALTY_SORT = { columnId: 'points', direction: 'desc' } as const;

/**
 * Wallet: the pilot's own ISK — balance and journal, for the active Character
 * or every Character (`?char=`). Read-only, cached for offline. Recent
 * transactions live on Market's History tab, and the corporation's wallet
 * lives on `/corp/wallet` (it was a Personal /
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
  const tabsId = useTabsId();
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
   * and a pasted link. Absent, it reads this page's remembered pick, then the
   * synced Settings default (`characterFilterPicks.ts`). A link's value is
   * never remembered; only a change to the control is.
   */
  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof WALLET_CHARACTER_PARAMS>(
    'wallet',
    'char'
  );
  const [walletParams, setWalletParams] = useRememberedUrlParams(
    WALLET_CHARACTER_PARAMS,
    rememberedCharacterFilter
  );
  const walletCharacterFilter = walletParams.char;
  const setWalletCharacterFilter = (char: CharacterFilterValue) => setWalletParams({ char });

  // A Character named in the URL is the one page subject: the balance panel
  // follows it rather than a stored "all" default.
  const resolvedWalletFilter = useResolvedCharacterFilter(
    viewedCharacterId === undefined ? walletCharacterFilter : 'current',
    activeCharacterId
  );
  const showingBeyondActive =
    resolvedWalletFilter === 'all' ||
    resolvedWalletFilter.size !== 1 ||
    !resolvedWalletFilter.has(activeCharacterId ?? -1);

  const { drilledId, drillInto, leaveDrill, backButtonRef, panelHeadingRef } = useWalletDrill();

  const allCharacters = useCharacters();
  const activeCharacter = allCharacters.find((c) => c.characterId === activeCharacterId);
  const drilledCharacter = allCharacters.find((c) => c.characterId === drilledId);
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
      allCharacters
        .filter((c) => resolvedWalletFilter === 'all' || resolvedWalletFilter.has(c.characterId))
        .map((c) => ({ characterId: c.characterId, name: c.name })),
    [allCharacters, resolvedWalletFilter]
  );
  const walletFilterCandidates = useMemo(
    () => allCharacters.map((c) => ({ characterId: c.characterId, characterName: c.name })),
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

  const balances = useWalletBalances(showingBeyondActive || !!drilledCharacter, multiCharacters);

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
  // The Journal's own Character filter reads the same `?char=` pick as the
  // Balance tab; anything beyond the active Character fans the journal out
  // across the picked Characters, and the pick is part of the snapshot's key.
  const journalSelectionKey =
    tab === 'journal' && showingBeyondActive && multiCharacters.length > 0
      ? multiCharacters.map((c) => c.characterId).join(',')
      : null;
  const allJournals = useCorpSnapshot<AllJournalsSnapshot | null>(journalSelectionKey, () =>
    loadAllCharactersJournals(multiCharacters)
  );
  const scopedCharacterIds = useLiveQuery(loadWalletScopedCharacterIds, [], undefined);
  // "Where the ISK went" side panel; the page shifts aside while it is open.
  const [iskPanelOpen, setIskPanelOpen] = useState(false);
  const handlePersonalRefresh = () => {
    refresh();
    personalFills.refresh();
    allJournals.refresh();
  };

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
            to={`/wallet/lp-store/${entry.corporation_id}`}
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

  // The fills that name an item or a PLEX line: this Character's, or every loaded Character's.
  const allJournalsData = showingBeyondActive ? allJournals.data : null;
  // Tagged with their Character in the multi view: two journals can carry the same ref id.
  const personalTransactions = useMemo<
    readonly (WalletTransactionCommon & { characterId?: number })[]
  >(
    () =>
      allJournalsData
        ? allJournalsData.loaded.flatMap((c) =>
            c.transactions.map((txn) => ({ ...txn, characterId: c.characterId }))
          )
        : (personalFills.data?.transactions ?? EMPTY_FILLS),
    [allJournalsData, personalFills.data]
  );
  const personalTypeNames =
    (allJournalsData ? allJournalsData.typeNames : personalFills.data?.typeNames) ?? NO_NAMES;
  const itemNamesTruncated = allJournalsData
    ? allJournalsData.loaded.some((c) => c.fillsTruncated)
    : (personalFills.data?.truncated ?? false);
  const journalIsTruncated = allJournalsData
    ? allJournalsData.loaded.some((c) => c.truncated)
    : journalTruncated;
  const keyByCharacter = (allJournalsData?.loaded.length ?? 0) > 1;
  // The stalest of the loaded journals, as the Balance tab does for its balances.
  const allJournalsFetchedAt = useMemo(
    () =>
      allJournalsData && allJournalsData.loaded.length > 0
        ? new Date(Math.min(...allJournalsData.loaded.map((c) => c.fetchedAt.getTime())))
        : null,
    [allJournalsData]
  );
  const personalLinkFor = useMemo(
    () => journalTransactionLinks(personalTransactions),
    [personalTransactions]
  );
  const personalNameFor = useMemo(() => typeNameLookup(personalTypeNames), [personalTypeNames]);
  const characterNameFor = useMemo(() => {
    const names = new Map(allCharacters.map((c) => [c.characterId, c.name]));
    return (id: number) => names.get(id) ?? `#${id}`;
  }, [allCharacters]);
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
    () =>
      buildJournalColumns(
        personalLinkFor,
        personalNameFor,
        miningTaxHrefFor,
        showingBeyondActive ? characterNameFor : undefined
      ),
    [
      buildJournalColumns,
      personalLinkFor,
      personalNameFor,
      miningTaxHrefFor,
      showingBeyondActive,
      characterNameFor,
    ]
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
    for (const entry of balances.snapshot?.entries ?? []) {
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
  }, [balances.snapshot, activeCharacterId, balanceResult, balanceNeedsReauth]);
  // Lines between the pilot's own Characters are netted against every Character
  // with the wallet permission, picked or not: a donation from your own alt is
  // internal even in the one-Character view.
  const journalRows = useMemo<readonly JournalLine[]>(
    () =>
      allJournalsData
        ? allJournalsData.loaded.flatMap((c) =>
            c.journal.map((entry) => ({ ...entry, characterId: c.characterId }))
          )
        : showingBeyondActive || activeCharacterId === null
          ? []
          : journal,
    [allJournalsData, showingBeyondActive, journal, activeCharacterId]
  );
  const trackedIds = useMemo(() => {
    const ids = new Set(scopedCharacterIds ?? []);
    for (const c of allJournalsData?.loaded ?? []) ids.add(c.characterId);
    if (!showingBeyondActive && activeCharacterId !== null && !journalNeedsReauth) {
      ids.add(activeCharacterId);
    }
    return ids;
  }, [
    allJournalsData,
    scopedCharacterIds,
    showingBeyondActive,
    activeCharacterId,
    journalNeedsReauth,
  ]);
  const classifiedJournal = useMemo(
    () => classifyJournal(journalRows, { trackedIds, linkFor: personalLinkFor }),
    [journalRows, trackedIds, personalLinkFor]
  );
  const journalCoverageInfo = useMemo(() => {
    if (allCharacters.length < 2) return undefined;
    return allJournalsData
      ? journalCoverage(multiCharacters, new Set(allJournalsData.loaded.map((c) => c.characterId)))
      : journalCoverage(
          allCharacters.map((c) => ({ characterId: c.characterId, name: c.name })),
          trackedIds
        );
  }, [allCharacters, allJournalsData, multiCharacters, trackedIds]);
  const { filteredJournal, breakdownJournal, chartJournal, refTypeOptions } =
    useJournalFilterResult(classifiedJournal, journalRowsFilter);
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  // Each table's title-bar export button and its row menus export the same rows, in
  // the order the table shows them.
  const journalCsvColumns = useMemo(
    () => walletJournalCsvColumns(t, showingBeyondActive ? characterNameFor : undefined),
    [t, showingBeyondActive, characterNameFor]
  );
  const journalExport = useTableExport({
    surface: 'wallet-journal',
    rows: filteredJournal,
    columns: journalCsvColumns,
    truncated: journalIsTruncated,
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

  const journalFetchedAt = showingBeyondActive
    ? allJournalsFetchedAt
    : (journalResult?.fetchedAt ?? null);
  // An alert's entry id belongs to the active Character; the multi view keys rows per Character.
  const journalHighlightKey =
    keyByCharacter && highlightedEntryId !== null
      ? `${activeCharacterId}:${highlightedEntryId}`
      : highlightedEntryId;
  const journalScopeLabel = !showingBeyondActive
    ? t('character.filter.thisCharacter')
    : multiCharacters.length === allCharacters.length
      ? t('character.filter.allCharacters')
      : multiCharacters.length === 1
        ? t('character.scope.one', { name: multiCharacters[0].name })
        : t('wallet.journalScopeSome', { count: multiCharacters.length });

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
  if (tab === 'transactions') return <Navigate to="/market/history" replace />;

  return (
    <div
      className={cx(
        'mx-auto max-w-6xl space-y-4',
        // The side panel is non-modal: the page shifts aside so no column is covered.
        // 26rem = SlideOver's 25rem max width plus a 1rem gutter; change them together.
        tab === 'journal' && iskPanelOpen && 'md:mr-[26rem] md:ml-0'
      )}
    >
      {tab === 'journal' && <FromWalletCrumb />}
      <PageHeader
        title={t('wallet.title')}
        meta={oldestFetchedAt ? <DataAgeBadge date={oldestFetchedAt} /> : undefined}
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('wallet.refresh')}
            onClick={handlePersonalRefresh}
            disabled={loading || personalFills.loading || allJournals.loading}
          />
        }
      />

      {/*
        No Transactions entry: the Character's fills are Market's tab, and the
        corporation's are on `/corp/wallet` — an entry that switched pages
        would not be a tab.
      */}
      <Tabs
        tabsId={tabsId}
        label={t('wallet.title')}
        value={tab}
        // LP Store is its own route: Wallet's query (`?char=`, journal filters) stays behind,
        // as it does on the way back.
        onChange={(id) =>
          id === 'lp-store' ? navigate(tabPath(WALLET_TABS, 'lp-store')) : setTab(id as typeof tab)
        }
        tabs={[
          { id: 'balance', label: t('wallet.balanceTab') },
          { id: 'journal', label: t('wallet.journalTab') },
          // Its own route draws this same bar (`LoyaltyStore`).
          { id: 'lp-store', label: t('loyaltyStore.title') },
        ]}
      />

      <TabPanel tabsId={tabsId} tabId={tab} className="space-y-4">
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
                backRef={backButtonRef}
                characters={drilledCharacters}
                liveWallet={liveWallet}
                filterMeta={walletCharacterFilterMeta}
                onDrill={drillInto}
                onBack={leaveDrill}
                headingRef={panelHeadingRef}
              />
            ) : showingBeyondActive ? (
              <NetWorthPanel
                mode="multi"
                characters={multiCharacters}
                liveWallet={liveWallet}
                notices={
                  balances.cachedAt !== null && (
                    <CachedNotice
                      className="mt-3"
                      fetchedAt={balances.cachedAt}
                      refreshFailed={balances.refreshCount > 0}
                    />
                  )
                }
                filterMeta={walletCharacterFilterMeta}
                onDrill={drillInto}
                onBack={leaveDrill}
                headingRef={panelHeadingRef}
                actions={
                  <IconButton
                    size="sm"
                    icon={<Icon.Refresh />}
                    label={t('wallet.refresh')}
                    onClick={balances.refresh}
                    disabled={balances.loading}
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
                  headingRef={panelHeadingRef}
                  stats={
                    <div>
                      <p className={cx(eyebrowClassName, 'flex items-center gap-1')}>
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
                        <CachedNotice
                          className="mt-3"
                          fetchedAt={oldestFetchedAt}
                          refreshFailed={refreshCount > 0}
                        />
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

            <WalletLoyaltyPanel
              activeCharacterId={activeCharacterId}
              loyaltyResult={loyaltyResult}
              loyaltyNeedsReauth={loyaltyNeedsReauth}
              otherLoyalty={otherLoyalty}
              columns={loyaltyColumns}
              sortProps={loyaltySortProps}
              tableExport={loyaltyExport}
            />
          </div>
        ) : (
          <WalletJournalPanel
            activeCharacterId={activeCharacterId}
            showingBeyondActive={showingBeyondActive}
            iskPanelOpen={iskPanelOpen}
            filterMeta={walletCharacterFilterMeta}
            refreshCount={refreshCount}
            archive={data?.archive}
            journalResult={journalResult}
            journalNeedsReauth={journalNeedsReauth}
            journalLength={journal.length}
            allJournalsData={allJournalsData}
            allJournalsLoading={allJournals.loading}
            hasJournalSelection={journalSelectionKey !== null}
            onRetryAllJournals={allJournals.refresh}
            journalFetchedAt={journalFetchedAt}
            journalExport={journalExport}
            journalIsTruncated={journalIsTruncated}
            itemNamesTruncated={itemNamesTruncated}
            table={{
              filter: journalFilter,
              onFilterChange: setJournalFilter,
              refTypeOptions,
              filteredJournal,
              breakdownJournal,
              chartJournal,
              journalColumns,
              sort: journalSortProps.sort,
              onSortChange: journalSortProps.onSortChange,
              highlightRowKey: journalHighlightKey,
              keyByCharacter,
            }}
            onIskPanelOpenChange={setIskPanelOpen}
            scopeLabel={journalScopeLabel}
            coverage={journalCoverageInfo}
          />
        )}
      </TabPanel>
    </div>
  );
}
