import { Suspense, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import '@/i18n';
import { TooltipProvider } from '@/components/ui';
import { configureEsi } from '@/esi/client';
import { getAccessTokenReportingFailures } from '@/app/tokenProvider';
import { ScopeGate } from '@/app/ScopeGate';
import { TabRoute } from '@/app/TabRoute';
import { PAGE_LEGACY_LOCATIONS, PAGE_TABS, routePatternFor } from '@/app/pageTabs';
import type { AppRoutePath } from '@/app/routeScopes';
import { EntityInfoRoute } from '@/features/entities';
import { ItemInfoModal } from '@/features/entities/ItemInfoModal';
import { PlaceInfoModal } from '@/features/entities/PlaceInfoModal';
import { LocationProbe } from '@/test/LocationProbe';
import { PublicInfoModal, RouteEffects, SkillDetailModal } from '@/test/routeWithoutShellParts';

// Renders one feature route the way App.tsx mounts it — its ScopeGate, its
// TabRoute for a tabbed page, the info modals — but without App's boot work
// and without the signed-in shell (Layout's rail, pollers, prefetch, sync).
// That boot is what made a route test pay seconds per scenario and time out on
// a loaded CI worker. Left out, so still `<App />`'s to test: RequireCharacter
// (no session -> /login), AuthFailureRedirect, the route table's redirects, the
// shell and its nav, the font scale, and the remount on a number-format change.
// The test seeds the session itself (an active Character in Dexie).

/**
 * Renders the feature route at `path` (with `element` as its page) against
 * `window.location`, so a test sets its URL with `history.pushState` and reads
 * what the page wrote back from `window.location` or the `location` test id
 * (`LocationProbe`). A navigation to another route lands on the probe alone.
 */
export function renderRouteWithoutShell(path: AppRoutePath, element: ReactElement): RenderResult {
  configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
  const tabs = PAGE_TABS[path];
  const gated = <ScopeGate path={path}>{element}</ScopeGate>;
  return render(
    <TooltipProvider>
      <RouteEffects />
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route
              path={routePatternFor(path)}
              element={
                tabs ? (
                  <TabRoute page={tabs} legacy={PAGE_LEGACY_LOCATIONS[path]}>
                    {gated}
                  </TabRoute>
                ) : (
                  gated
                )
              }
            />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </Suspense>
        <EntityInfoRoute />
        <PublicInfoModal />
        <SkillDetailModal />
        <ItemInfoModal />
        <PlaceInfoModal />
      </BrowserRouter>
    </TooltipProvider>
  );
}
