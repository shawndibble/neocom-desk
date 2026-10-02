import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePageTab } from '@/lib/usePageTab';
import { TRAVEL_TABS } from '@/app/pageTabs';
import { isTabRouteDefaulted } from '@/lib/pageTabs';
import { RouteSafetyTab } from '@/features/travel/RouteSafetyTab';
import { TheraTab } from '@/features/travel/TheraTab';

/**
 * Travel (issue #2328): intel for getting somewhere — Route Safety and Thera/Turnur
 * connections (#2330). Pilot Lookup (#2331) is its own page, `/pilot-lookup`.
 * Signed-in like every other route; logged-out access is a possible follow-up.
 */
export function Travel() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = usePageTab(TRAVEL_TABS);
  const location = useLocation();

  // A shared `/travel?pilot=<id>` from before Pilot Lookup was its own page
  // names no tab, so `TabRoute` defaults it to Route Safety; the pilot it names
  // belongs on `/pilot-lookup`. Only that defaulted landing moves: an explicit
  // Route Safety link must stay put.
  if (isTabRouteDefaulted(location.state) && new URLSearchParams(location.search).has('pilot')) {
    return <Navigate replace to={{ pathname: '/pilot-lookup', search: location.search }} />;
  }

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
      {tab === 'thera' ? <TheraTab tabBar={tabBar} /> : <RouteSafetyTab tabBar={tabBar} />}
    </div>
  );
}
