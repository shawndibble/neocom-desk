import { FromWalletCrumb } from '@/features/netWorth/FromWalletCrumb';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs, TabPanel, useTabsId } from '@/components/ui';
import { usePageTab } from '@/lib/usePageTab';
import { tabBarTabs } from '@/lib/pageTabs';
import { ASSETS_TABS } from '@/app/pageTabs';
import { cx } from '@/lib/cx';
import { MovePlanTab } from '@/features/assets/MovePlanTab';
import { MyShipsView } from '@/features/assets/MyShipsView';
import { assetHref } from '@/features/assets/assetBrowseModel';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { AssetsList } from '@/features/assets/AssetsList';
import { AssetsPageHeader } from '@/features/assets/AssetsPageHeader';
import { AssetsToolbar } from '@/features/assets/AssetsToolbar';
import { useAssetsData } from '@/features/assets/useAssetsData';
import { useAssetsRows } from '@/features/assets/useAssetsRows';

/** Character assets, browsed one level at a time. Read-only, cached for offline. */
export function Assets() {
  const { t } = useTranslation();
  // "Where am I" lives in the URL (`/assets/:stationId/*`), not in state, so
  // the browser/Android back button steps up one level instead of leaving the
  // page — the single most important thing about drill-down on a phone.
  const [tab, setTab] = usePageTab(ASSETS_TABS);
  const tabsId = useTabsId();
  const { search: query } = useLocation();
  const assetsData = useAssetsData();
  const assetsRows = useAssetsRows(assetsData);
  const {
    hydrated,
    activeCharacterId,
    setView,
    crossCharacterCandidates,
    shipCharacterIds,
    shipsFilterIsAll,
    itemActions,
  } = assetsData;
  const { assetsRoute } = assetsRows;
  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <ItemActionsProvider page={itemActions}>
      <div
        className={cx(
          'mx-auto flex w-full max-w-6xl flex-col gap-3',
          // Fills the remaining viewport height (issue #148) rather than
          // growing with content: bounds the height against `<main>`'s own
          // chrome (Layout.tsx's `p-4`, plus the mobile bottom nav's
          // `calc(5rem+safe-area)` reservation below `md`, mirrored here since
          // that reservation isn't itself exposed as a token) so the list
          // Panel below — the only `flex-1` child — has real remaining space
          // to fill instead of a `flex-1` that's inert with no bounded
          // ancestor.
          'h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-2rem)]'
        )}
      >
        <FromWalletCrumb />
        <AssetsPageHeader tab={tab} assetsData={assetsData} assetsRows={assetsRows} />
        <Tabs
          tabsId={tabsId}
          label={t('assets.title')}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={tabBarTabs(ASSETS_TABS).map((item) => ({ id: item.id, label: t(item.labelKey) }))}
        />

        <TabPanel tabsId={tabsId} tabId={tab} className="flex min-h-0 flex-1 flex-col gap-3">
          {tab === 'ships' && (
            <MyShipsView
              characterIds={shipCharacterIds}
              activeCharacterId={activeCharacterId}
              onShowAllCharacters={
                !shipsFilterIsAll && crossCharacterCandidates.length > 1
                  ? () => setView({ chars: 'all' })
                  : undefined
              }
              hrefFor={(locationId) => assetHref(locationId, [], query)}
              route={assetsRoute}
            />
          )}

          {tab === 'move' && (
            <MovePlanTab
              onClose={() => setTab('items')}
              characterIds={shipCharacterIds}
              activeCharacterId={activeCharacterId}
            />
          )}

          {tab === 'items' && (
            <>
              <AssetsToolbar assetsData={assetsData} assetsRows={assetsRows} />
              <AssetsList assetsData={assetsData} assetsRows={assetsRows} query={query} />
            </>
          )}
        </TabPanel>
      </div>
    </ItemActionsProvider>
  );
}
