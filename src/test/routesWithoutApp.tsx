import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui';
import { configureEsi } from '@/esi/client';
import { configureActiveCharacter } from '@/esi/lane';
import { getAccessTokenReportingFailures } from '@/app/tokenProvider';
import { useHiddenNav, useRecentNav } from '@/app/navPreferences';
import { useHintCounts } from '@/lib/hintFlags';
import { useFontScale } from '@/lib/fontScale';
import { useMobileTabs } from '@/lib/mobileTabs';
import { useNumberFormat } from '@/lib/numberFormat';
import { useTimeFormat } from '@/lib/timeFormat';
import { useActiveCharacter } from '@/stores/activeCharacter';

// What `App.tsx` wires at module load: authenticated ESI reads use the stored
// tokens, and the active Character's reads queue first.
configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
configureActiveCharacter(() => useActiveCharacter.getState().activeCharacterId);

/**
 * What `App`'s boot effects (`AppEffects`) hydrate for every page: the active
 * Character, and the device preferences the shell reads before any route.
 */
function hydrateAppState(): void {
  void useActiveCharacter.getState().hydrate();
  for (const store of [
    useFontScale,
    useTimeFormat,
    useNumberFormat,
    useMobileTabs,
    useHiddenNav,
    useRecentNav,
    useHintCounts,
  ]) {
    void store.getState().hydrate();
  }
}

/**
 * Renders a page's `<Route>`s on a real `BrowserRouter` at the current
 * `window.location`, with what `App` gives every page (tooltips, ESI wired to
 * the stored tokens, the active Character and device preferences hydrated from
 * Dexie) but none of its boot: no shell, auth gate, pollers or boot prefetch.
 * `window.history` and `window.location` stay the test's navigation; any other
 * path renders nothing. `extras` sit beside the routes, inside the router, as
 * `App`'s modals do. Keep `<App />` for redirects, the shell and auth gating.
 * Area helpers wrap it: `renderSkillsRoutes`, `renderSettingsPage`.
 */
export function renderRoutesWithoutApp(routes: ReactNode, extras?: ReactNode): RenderResult {
  hydrateAppState();
  return render(
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          {routes}
          <Route path="*" element={null} />
        </Routes>
        {extras}
      </BrowserRouter>
    </TooltipProvider>
  );
}
