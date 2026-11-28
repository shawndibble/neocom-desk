import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  LoadFailedState,
  IconButton,
  PageHeader,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
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
import { useNetWorthMissingNames } from '@/features/netWorth/useNetWorthData';
import { WalletRangeControl } from '@/features/netWorth/WalletRangeControl';
import { WalletBalanceTab } from '@/features/character/WalletBalanceTab';
import { WalletJournalPanel } from '@/features/character/WalletJournalPanel';
import { useWalletBalances } from '@/features/character/useWalletBalances';
import { useWalletDrill } from '@/features/character/useWalletDrill';
import { useWalletJournalView } from '@/features/character/useWalletJournalView';
import { useWalletLoyalty } from '@/features/character/useWalletLoyalty';
import { usePickedLoyalty } from '@/features/character/usePickedLoyalty';
import { loadWalletSnapshot } from '@/features/character/walletSnapshot';

const WALLET_CHARACTER_PARAMS = { char: characterFilterParam('current') };
const NO_PILOTS: readonly { characterId: number; name: string }[] = [];

export function Wallet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const viewedCharacterId = useViewedCharacterId();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadWalletSnapshot, viewedCharacterId, { cacheKey: 'wallet' });

  const [tab, setTab] = usePageTab(WALLET_TABS);
  const tabsId = useTabsId();

  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof WALLET_CHARACTER_PARAMS>(
    'wallet',
    'char'
  );
  const [walletParams, setWalletParams] = useRememberedUrlParams(
    WALLET_CHARACTER_PARAMS,
    rememberedCharacterFilter
  );
  const walletCharacterFilter = walletParams.char;

  const resolvedWalletFilter = useResolvedCharacterFilter(
    viewedCharacterId === undefined ? walletCharacterFilter : 'current',
    activeCharacterId
  );
  const showingBeyondActive =
    resolvedWalletFilter === 'all' ||
    resolvedWalletFilter.size !== 1 ||
    !resolvedWalletFilter.has(activeCharacterId ?? -1);

  const drill = useWalletDrill();
  const setWalletCharacterFilter = (char: CharacterFilterValue) => {
    setWalletParams({ char });
    if (drill.drilledId !== 0) drill.clearDrill();
  };

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
  const netWorthMissingNames = useNetWorthMissingNames(
    tab === 'balance' && showingBeyondActive && !drilledCharacter ? multiCharacters : NO_PILOTS
  );
  const walletScopePicker =
    walletFilterCandidates.length > 1 ? (
      <CharacterFilterControl
        activeCharacterId={activeCharacterId}
        value={viewedCharacterId === undefined ? walletCharacterFilter : 'current'}
        onChange={setWalletCharacterFilter}
        characterCount={walletFilterCandidates.length}
        missingNames={netWorthMissingNames}
        loading={loading && !data}
      />
    ) : undefined;

  const balances = useWalletBalances(showingBeyondActive || !!drilledCharacter, multiCharacters);

  const balanceResult = data?.balanceResult ?? null;
  const balanceNeedsReauth = data?.balanceNeedsReauth ?? false;
  const journalResult = data?.journalResult ?? null;
  const journalNeedsReauth = data?.journalNeedsReauth ?? false;
  const journalTruncated = data?.journalTruncated ?? false;
  const pickedLoyalty = usePickedLoyalty(showingBeyondActive, multiCharacters);
  const activeLoyaltyNeedsReauth = data?.loyaltyNeedsReauth ?? false;
  const loyaltyResult = showingBeyondActive
    ? (pickedLoyalty.snapshot?.loyaltyResult ?? null)
    : activeLoyaltyNeedsReauth
      ? null
      : (data?.loyaltyResult ?? null);
  const loyaltyLoading = showingBeyondActive && pickedLoyalty.snapshot === null;

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
  const loyalty = useWalletLoyalty(loyaltyResult);
  const [iskPanelOpen, setIskPanelOpen] = useState(false);
  const handlePersonalRefresh = () => {
    refresh();
    journalView.refresh();
    pickedLoyalty.refresh();
  };

  const oldestFetchedAt = useMemo(() => {
    const dates = [balanceResult?.fetchedAt, loyaltyResult?.fetchedAt].filter(
      (d): d is Date => d != null
    );
    return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
  }, [balanceResult, loyaltyResult]);

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;
  if (new URLSearchParams(location.search).get('owner') === 'corporation') {
    const search = new URLSearchParams(location.search);
    search.delete('owner');
    const query = search.toString();
    return <Navigate to={`/corp/wallet${query ? `?${query}` : ''}`} replace />;
  }
  if (tab === 'transactions') return <Navigate to="/market/history" replace />;

  return (
    <div
      className={cx(
        'mx-auto max-w-page space-y-4',
        tab === 'journal' && iskPanelOpen && 'md:mr-[26rem] md:ml-0'
      )}
    >
      {tab === 'journal' && <FromWalletCrumb />}
      <PageHeader
        title={t('wallet.title')}
        meta={
          tab === 'balance' && oldestFetchedAt ? <DataAgeBadge date={oldestFetchedAt} /> : undefined
        }
        scope={walletScopePicker}
        actions={
          <>
            {tab === 'balance' && <WalletRangeControl />}
            <IconButton
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={handlePersonalRefresh}
              busy={loading || journalView.loading}
            />
          </>
        }
      />

      <Tabs
        tabsId={tabsId}
        label={t('wallet.title')}
        value={tab}
        onChange={(id) =>
          id === 'lp-store' ? navigate(tabPath(WALLET_TABS, 'lp-store')) : setTab(id as typeof tab)
        }
        tabs={[
          { id: 'balance', label: t('wallet.balanceTab') },
          { id: 'journal', label: t('wallet.journalTab') },
          { id: 'lp-store', label: t('loyaltyStore.title') },
        ]}
      />

      <TabPanel tabsId={tabsId} tabId={tab} className="space-y-4">
        {loading && !data ? (
          <Spinner block="page" label={t('common.loading')} />
        ) : error ? (
          <LoadFailedState title={t('common.loadFailed.wallet')} onRetry={refresh} />
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
            balanceResult={balanceResult}
            balanceNeedsReauth={balanceNeedsReauth}
            loyaltyResult={loyaltyResult}
            loyaltyLoading={loyaltyLoading}
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
            refreshCount={refreshCount}
            archive={data?.archive}
            journalResult={journalResult}
            journalNeedsReauth={journalNeedsReauth}
            onRetryJournal={handlePersonalRefresh}
            {...journalView.panel}
            onIskPanelOpenChange={setIskPanelOpen}
          />
        )}
      </TabPanel>
    </div>
  );
}
