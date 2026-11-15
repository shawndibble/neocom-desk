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

// The per-page wiring `App` gives every feature route, apart from its boot,
// shell and auth gate. Its own module so a page test mounts a route the same
// way (`src/test/renderPage.tsx`) instead of keeping a copy that drifts.

/**
 * Wires authenticated ESI calls to the stored tokens. Wrapped
 * (tokenProvider.ts) so a dead refresh grant is reported centrally instead of
 * surfacing as an empty view in whichever feature happened to ask first. The
 * active Character's reads queue ahead of every other Character's (#2281).
 */
export function configureAppEsi(): void {
  configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
  configureActiveCharacter(() => useActiveCharacter.getState().activeCharacterId);
}

/**
 * A feature route's element as `App` mounts it: behind its `ScopeGate`, and a
 * tabbed page (`pageTabs.ts`) inside its `TabRoute`, with its legacy locations.
 */
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

/**
 * The state every page reads that `App` loads once, before any route: the
 * active Character, its stored view snapshots, the device preferences, and the
 * auth-failure subscription.
 */
export function useAppStateHydration(): void {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // The active Character's stored view snapshots, read while the first route's
  // code is still loading, so that route's first frame already has them.
  useEffect(() => {
    if (activeCharacterId === null) return;
    void hydrateRouteSnapshots(activeCharacterId);
    void hydrateRouteSnapshots(ACCOUNT_SNAPSHOT_ID);
  }, [activeCharacterId]);

  // Applies the stored text-scale to <html> as early as possible, regardless
  // of which route the user lands on — it is not something visiting /settings
  // should be required for.
  useHydratedStore(useFontScale);

  // Same reasoning, one level up from any single view: the Time format
  // preference is read by `DataAgeBadge` — which rides on nearly every
  // ESI-backed page — plus fourteen more call sites across nine files
  // (Contracts, Clones, Wallet, Market, Overview, PI, notifications, and
  // the signed-out landing page's sample timestamps). Hydrating per consumer
  // would be that many copies of this effect racing for the same Dexie row,
  // and each would still paint its first frame on the default before the
  // read landed. Once here, before any route mounts, covers them all.
  useHydratedStore(useTimeFormat);

  // The Number format preference, for the same reason: every formatter reads it.
  useHydratedStore(useNumberFormat);

  // And the phone's chosen bottom tabs, for the same reason one level lower:
  // `Layout` is the only reader, but it renders on every route, so hydrating
  // it there would still paint the default bar first on a cold load. Here it
  // is read once, before the shell mounts.
  useHydratedStore(useMobileTabs);

  // The rail's and More sheet's hidden pages and Recent row: same reason.
  useHydratedStore(useHiddenNav, useRecentNav, useHintCounts);

  // `esi` publishes auth failures; the store is subscribed here so `esi` keeps
  // no dependency on `src/stores` (docs/ARCHITECTURE.md §2).
  useEffect(() => subscribeToEsiAuthFailures(), []);
}
