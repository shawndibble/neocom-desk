import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePageTab } from '@/lib/usePageTab';
import { TRAVEL_TABS } from '@/app/pageTabs';
import { isTabRouteDefaulted, tabPath } from '@/lib/pageTabs';
import { PilotLookupTab } from '@/features/travel/PilotLookupTab';
import { RouteSafetyTab } from '@/features/travel/RouteSafetyTab';

/**
 * Travel (issue #2328): intel for getting somewhere — Route Safety first, with
 * Pilot Lookup beside it (#2331) and Thera/Turnur connections to follow (#2330).
 * Signed-in like every other route; logged-out access is a possible follow-up.
 */
export function Travel() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = usePageTab(TRAVEL_TABS);
  const location = useLocation();

  // A shared `/travel?pilot=<id>` names no tab, so `TabRoute` defaults it to
  // Route Safety; the pilot it names belongs to Pilot Lookup. Only that
  // defaulted landing moves: the query rides along on a tab switch, and an
  // explicit Route Safety link must stay put.
  if (
    tab !== 'pilot' &&
    isTabRouteDefaulted(location.state) &&
    new URLSearchParams(location.search).has('pilot')
  ) {
    return (
      <Navigate replace to={{ pathname: tabPath(TRAVEL_TABS, 'pilot'), search: location.search }} />
    );
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
      {tab === 'pilot' ? <PilotLookupTab tabBar={tabBar} /> : <RouteSafetyTab tabBar={tabBar} />}
    </div>
  );
}
