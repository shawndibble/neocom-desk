import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs, useTabsId } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePageTab } from '@/lib/usePageTab';
import { TRAVEL_TABS } from '@/app/pageTabs';
import { isTabRouteDefaulted, tabPath } from '@/lib/pageTabs';
import { PilotLookupPanel } from '@/features/travel/PilotLookupPanel';
import { RouteSafetyTab } from '@/features/travel/RouteSafetyTab';

/**
 * Travel (issue #2328): intel for getting somewhere — Route Safety (with Thera/Turnur
 * connections (#2330) as a modal on it) and Pilot Lookup (#2331), back under Travel (scope decision
 * `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`).
 * Signed-in like every other route; logged-out access is a possible follow-up.
 */
export function Travel() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = usePageTab(TRAVEL_TABS);
  const tabsId = useTabsId();
  const location = useLocation();

  // A shared `/travel?pilot=<id>` from before Pilot Lookup was a tab names no
  // tab, so `TabRoute` defaults it to Route Safety; the pilot it names belongs
  // on the Pilot Lookup tab. Only that defaulted landing moves: an explicit
  // Route Safety link must stay put.
  if (isTabRouteDefaulted(location.state) && new URLSearchParams(location.search).has('pilot')) {
    return (
      <Navigate replace to={{ pathname: tabPath(TRAVEL_TABS, 'pilot'), search: location.search }} />
    );
  }

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const tabs = TRAVEL_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }));
  const tabBar = (
    <Tabs
      tabsId={tabsId}
      label={t('travel.title')}
      value={tab}
      onChange={(id) => setTab(id as typeof tab)}
      tabs={tabs}
    />
  );
  const tabProps = { tabBar, tabsId };

  return (
    <div className="mx-auto max-w-page space-y-4">
      {tab === 'pilot' ? <PilotLookupPanel {...tabProps} /> : <RouteSafetyTab {...tabProps} />}
    </div>
  );
}
