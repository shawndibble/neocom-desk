import { Suspense, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import '@/i18n';
import { configureEsi } from '@/esi/client';
import type { SettingStore } from '@/lib/settingStore';
import { deferred } from './deferred';
import { configureActiveCharacter } from '@/esi/lane';
import { getAccessTokenReportingFailures } from '@/app/tokenProvider';
import { PAGE_LEGACY_LOCATIONS, PAGE_TABS, routePatternFor } from '@/app/pageTabs';
import type { AppRoutePath } from '@/app/routeScopes';
import { TabRoute } from '@/app/TabRoute';
import { TooltipProvider } from '@/components/ui';
import { subscribeToEsiAuthFailures } from '@/stores/authFailure';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { Industry } from '@/routes/Industry';
import { IndustryPlanPage } from '@/routes/IndustryPlanPage';
import { IndustryGroupPage } from '@/routes/IndustryGroupPage';
import { PlanetaryIndustry } from '@/routes/PlanetaryIndustry';

// Renders the Industry and Planetary Industry pages under the real router at
// `window.location`, without booting `App`: no auth gate, shell, boot
// prefetch, background sync or pollers. What `App` adds that these pages lean
// on is wired here the same way — ESI's token provider and active-Character
// lane (`App.tsx`'s module scope), the auth-failure subscription, the tooltip
// provider, and each tabbed page's `TabRoute`. A `BrowserRouter`, so a test
// still reads where the page navigated from `window.location`.
//
// The route tests keep one to three `App` renders each for the wiring itself
// (the URL is reachable, legacy paths redirect); every other scenario renders
// through this.

configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
configureActiveCharacter(() => useActiveCharacter.getState().activeCharacterId);
// `App` subscribes on mount; for the length of a test file, once is the same.
subscribeToEsiAuthFailures();

const ROUTE_ELEMENTS: [AppRoutePath, ReactElement][] = [
  ['/industry', <Industry key="industry" />],
  ['/industry/plans/:planId', <IndustryPlanPage key="plan" />],
  ['/industry/groups/:groupId', <IndustryGroupPage key="group" />],
  ['/planetary-industry', <PlanetaryIndustry key="pi" />],
];

/** The industry routes alone, as `App` mounts them, at the current `window.location`. */
function industryRoutes(): ReactElement {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            {ROUTE_ELEMENTS.map(([path, element]) => {
              const tabs = PAGE_TABS[path];
              return (
                <Route
                  key={path}
                  path={routePatternFor(path)}
                  element={
                    tabs ? (
                      <TabRoute page={tabs} legacy={PAGE_LEGACY_LOCATIONS[path]}>
                        {element}
                      </TabRoute>
                    ) : (
                      element
                    )
                  }
                />
              );
            })}
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  );
}

/**
 * Hydrates the active Character from Dexie (what `App`'s boot effect does),
 * then renders the Industry and Planetary Industry routes. Seed Dexie and push the URL first.
 */
export async function renderIndustryRoutes(): Promise<RenderResult> {
  await useActiveCharacter.getState().hydrate();
  return render(industryRoutes());
}

/**
 * Puts a preference store back to unhydrated and holds its next `hydrate()`
 * until `release()`, so a test can assert what a page shows before the store
 * settles without racing a Dexie read. `restore()` puts the real `hydrate` back.
 */
export function holdHydration<T>(store: SettingStore<T>, value: T) {
  const realHydrate = store.getState().hydrate;
  const gate = deferred();
  store.setState({
    value,
    hydrated: false,
    hydrate: async () => {
      await gate.promise;
      await realHydrate();
    },
  });
  return {
    release: () => gate.resolve(),
    restore: () => store.setState({ hydrate: realHydrate }),
  };
}
