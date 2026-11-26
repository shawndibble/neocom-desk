import { useEffect, type ReactElement } from 'react';
import { configureEsi } from '@/esi/client';
import { configureActiveCharacter } from '@/esi/lane';
import { ACCOUNT_SNAPSHOT_ID, hydrateRouteSnapshots } from '@/lib/routeSnapshotCache';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useHintCounts } from '@/lib/hintFlags';
import { useFontScale } from '@/lib/fontScale';
import { useNumberFormat } from '@/lib/numberFormat';
import { useTimeFormat } from '@/lib/timeFormat';
import { useMobileTabs } from '@/lib/mobileTabs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { subscribeToEsiAuthFailures } from '@/stores/authFailure';
import { useHiddenNav, useRecentNav } from './navPreferences';
import { getAccessTokenReportingFailures } from './tokenProvider';
import { ScopeGate } from './ScopeGate';
import { TabRoute } from './TabRoute';
import { PAGE_LEGACY_LOCATIONS, PAGE_TABS } from './pageTabs';
import type { AppRoutePath } from './routeScopes';

export function configureAppEsi(): void {
  configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
  configureActiveCharacter(() => useActiveCharacter.getState().activeCharacterId);
}

export function featureRouteElement(path: AppRoutePath, element: ReactElement): ReactElement {
  const tabs = PAGE_TABS[path];
  const gated = <ScopeGate path={path}>{element}</ScopeGate>;
  return tabs ? (
    <TabRoute page={tabs} legacy={PAGE_LEGACY_LOCATIONS[path]}>
      {gated}
    </TabRoute>
  ) : (
    gated
  );
}

export function useAppStateHydration(): void {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    void hydrateRouteSnapshots(activeCharacterId);
    void hydrateRouteSnapshots(ACCOUNT_SNAPSHOT_ID);
  }, [activeCharacterId]);

  useHydratedStore(useFontScale);

  useHydratedStore(useTimeFormat);

  useHydratedStore(useNumberFormat);

  useHydratedStore(useMobileTabs);

  useHydratedStore(useHiddenNav, useRecentNav, useHintCounts);

  useEffect(() => subscribeToEsiAuthFailures(), []);
}
