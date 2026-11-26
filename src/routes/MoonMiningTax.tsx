import { lazy, Suspense, startTransition } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs, useTabsId } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePageTab } from '@/lib/usePageTab';
import { MINING_TABS } from '@/app/pageTabs';
import { named, preloadFrom } from '@/app/routeChunks';

const TAB_LOADERS = {
  tax: named(() => import('@/features/miningTax/TaxTab'), 'TaxTab'),
  overview: named(() => import('@/features/miningTax/OverviewTab'), 'OverviewTab'),
  survey: named(() => import('@/features/survey/SurveyTab'), 'SurveyTab'),
};
const TaxTab = lazy(TAB_LOADERS.tax);
const OverviewTab = lazy(TAB_LOADERS.overview);
const SurveyTab = lazy(TAB_LOADERS.survey);
const preloadTab = preloadFrom(TAB_LOADERS);

export function MoonMiningTax() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = usePageTab(MINING_TABS);
  const tabsId = useTabsId();

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const tabBar = (
    <Tabs
      tabsId={tabsId}
      label={t('miningTax.title')}
      value={tab}
      onChange={(id) => startTransition(() => setTab(id as typeof tab))}
      onPreload={preloadTab}
      tabs={MINING_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
    />
  );

  return (
    <div className="mx-auto max-w-page space-y-4">
      <Suspense fallback={<Spinner block="page" label={t('common.loading')} />}>
        {tab === 'overview' && <OverviewTab tabBar={tabBar} tabsId={tabsId} />}
        {tab === 'tax' && <TaxTab tabBar={tabBar} tabsId={tabsId} />}
        {tab === 'survey' && <SurveyTab tabBar={tabBar} tabsId={tabsId} />}
      </Suspense>
    </div>
  );
}
