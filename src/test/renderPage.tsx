import { Suspense, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import '@/i18n';
import { TooltipProvider } from '@/components/ui';
import { configureAppEsi, featureRouteElement } from '@/app/appWiring';
import { InfoModals } from '@/app/InfoModals';
import { routePatternFor } from '@/app/pageTabs';
import type { AppRoutePath } from '@/app/routeScopes';
import { LocationProbe } from '@/test/LocationProbe';
import { PageEffects } from '@/test/PageEffects';

// Renders feature routes the way `App.tsx` mounts them, from App's own pieces
// (`src/app/appWiring.tsx`, `InfoModals`) so the two cannot drift: each route
// behind its ScopeGate and, for a tabbed page, its TabRoute with its legacy
// locations; the info modals; ESI wired to the stored tokens; and the state App
// hydrates for every page (active Character, view snapshots, format and nav
// preferences, auth-failure subscription). Left out, so still `<App />`'s to
// test: the boot, the signed-in shell (rail, pollers, prefetch, sync),
// RequireCharacter (no session -> /login), AuthFailureRedirect, the route
// table's redirects, and the remount on a number-format change. Those boots are
// what made a route test pay seconds per scenario and time out on a loaded CI
// worker. The test seeds the session itself (an active Character in Dexie).

// What `App.tsx` does at module load.
configureAppEsi();

/** One feature route: its `App` path and its page element. */
export type PageRoute = readonly [AppRoutePath, ReactElement];

/**
 * Renders `routes` against `window.location` on a real `BrowserRouter`, so a
 * test sets its URL with `history.pushState` and reads what the page wrote back
 * from `window.location` or the `location` test id. A navigation to any other
 * path lands on `LocationProbe` alone.
 */
export function renderPageRoutes(routes: readonly PageRoute[]): RenderResult {
  return render(
    <TooltipProvider>
      <PageEffects />
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            {routes.map(([path, element]) => (
              <Route
                key={path}
                path={routePatternFor(path)}
                element={featureRouteElement(path, element)}
              />
            ))}
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </Suspense>
        <InfoModals />
      </BrowserRouter>
    </TooltipProvider>
  );
}

/** `renderPageRoutes` for the one page at `path`. */
export function renderPageRoute(path: AppRoutePath, element: ReactElement): RenderResult {
  return renderPageRoutes([[path, element]]);
}
