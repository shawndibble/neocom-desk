import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePageTab } from '@/lib/usePageTab';
import { TRAVEL_TABS } from '@/app/pageTabs';
import { RouteSafetyTab } from '@/features/travel/RouteSafetyTab';

/**
 * Travel (issue #2328): intel for getting somewhere — Route Safety first, with
 * Thera/Turnur connections and Pilot Lookup to follow as tabs (#2330, #2331).
 * Signed-in like every other route; logged-out access is a possible follow-up.
 */
export function Travel() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = usePageTab(TRAVEL_TABS);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const tabBar = (
    <Tabs
      label={t('travel.title')}
      value={tab}
      onChange={(id) => setTab(id as typeof tab)}
      tabs={TRAVEL_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
    />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <RouteSafetyTab tabBar={tabBar} />
    </div>
  );
}
