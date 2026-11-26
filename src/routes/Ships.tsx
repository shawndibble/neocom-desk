import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Spinner, TabPanel } from '@/components/ui';
import { ShipsTabBar } from '@/features/fittings/ShipsTabBar';
import { SHIPS_TABS, SHIPS_TABS_ID } from '@/features/fittings/shipsTabs';
import { usePageTab } from '@/lib/usePageTab';
import { Fittings } from './Fittings';
import { guarded } from '@/app/routeChunks';

const ShipTreeTab = lazy(() =>
  guarded(() => import('@/features/fittings/shipTree/ShipTreeTab')).then((m) => ({
    default: m.ShipTreeTab,
  }))
);

export function Ships() {
  const { t } = useTranslation();
  const [tab] = usePageTab(SHIPS_TABS);
  if (tab !== 'tree') return <Fittings />;
  return (
    <div className="mx-auto max-w-page space-y-3">
      <PageHeader title={t('nav.ships')} />
      <ShipsTabBar />
      <TabPanel tabsId={SHIPS_TABS_ID} tabId={tab}>
        <Suspense fallback={<Spinner block="panel" label={t('common.loading')} />}>
          <ShipTreeTab />
        </Suspense>
      </TabPanel>
    </div>
  );
}
