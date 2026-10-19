import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useCharacters } from '@/features/character/useCharacters';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import { WALLET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { FromWalletCrumb } from '@/features/netWorth/FromWalletCrumb';
import { WalletBalanceTab } from '@/features/character/WalletBalanceTab';
import { WalletJournalPanel } from '@/features/character/WalletJournalPanel';
import { useWalletBalances } from '@/features/character/useWalletBalances';
import { useWalletDrill } from '@/features/character/useWalletDrill';
import { useWalletJournalView } from '@/features/character/useWalletJournalView';
import { useWalletLoyalty } from '@/features/character/useWalletLoyalty';
import { loadWalletSnapshot } from '@/features/character/walletSnapshot';

const WALLET_CHARACTER_PARAMS = { char: characterFilterParam('current') };

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

  const drill = useWalletDrill();

  const allCharacters = useCharacters();
  const activeCharacter = allCharacters.find((c) => c.characterId === activeCharacterId);
  const drilledCharacter = allCharacters.find((c) => c.characterId === drill.drilledId);
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

  const balanceResult = data?.balanceResult ?? null;
  const balanceNeedsReauth = data?.balanceNeedsReauth ?? false;
  const journalResult = data?.journalResult ?? null;
  const journalNeedsReauth = data?.journalNeedsReauth ?? false;
  const journalTruncated = data?.journalTruncated ?? false;
  const loyaltyResult = data?.loyaltyResult ?? null;
  const loyaltyNeedsReauth = data?.loyaltyNeedsReauth ?? false;
  const corporationNames = data?.corporationNames ?? NO_NAMES;

  const journalView = useWalletJournalView({
    journalOpen: tab === 'journal',
    activeCharacterId,
    showingBeyondActive,
    pickedCharacters: multiCharacters,
    allCharacters,
    journalResult,
    journalNeedsReauth,
    journalTruncated,
  });
  const loyalty = useWalletLoyalty(loyaltyResult, corporationNames);
  // "Where the ISK went" side panel; the page shifts aside while it is open.
  const [iskPanelOpen, setIskPanelOpen] = useState(false);
  const handlePersonalRefresh = () => {
    refresh();
    journalView.refresh();
  };

  // One age for the page: the stalest of the two feeds it shows.
  const oldestFetchedAt = useMemo(() => {
    const dates = [
      balanceResult?.fetchedAt,
      loyaltyNeedsReauth ? undefined : loyaltyResult?.fetchedAt,
    ].filter((d): d is Date => d != null);
    return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
  }, [balanceResult, loyaltyResult, loyaltyNeedsReauth]);

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
            disabled={loading || journalView.loading}
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
          <WalletBalanceTab
            activeCharacterId={activeCharacterId}
            drilledCharacter={drilledCharacter}
            activeCharacter={activeCharacter}
            showingBeyondActive={showingBeyondActive}
            pickedCharacters={multiCharacters}
            balances={balances}
            drill={drill}
            loyalty={loyalty}
            filterMeta={walletCharacterFilterMeta}
            balanceResult={balanceResult}
            balanceNeedsReauth={balanceNeedsReauth}
            loyaltyResult={loyaltyResult}
            loyaltyNeedsReauth={loyaltyNeedsReauth}
            journalNeedsReauth={journalNeedsReauth}
            journalTruncated={journalTruncated}
            oldestFetchedAt={oldestFetchedAt}
            refreshCount={refreshCount}
          />
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
            {...journalView.panel}
            onIskPanelOpenChange={setIskPanelOpen}
          />
        )}
      </TabPanel>
    </div>
  );
}
