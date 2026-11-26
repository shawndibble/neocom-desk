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

configureAppEsi();

export type PageRoute = readonly [AppRoutePath, ReactElement];

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

export function renderPageRoute(path: AppRoutePath, element: ReactElement): RenderResult {
  return renderPageRoutes([[path, element]]);
}
