import { useEffect, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { subscribeToEsiAuthFailures } from '@/stores/authFailure';
import { subscribeToEsiActivity } from '@/stores/activityLog';
import { useLiveQuery } from 'dexie-react-hooks';
import { configureEsi } from '@/esi/client';
import { triggerSync } from '@/sync';
import { db } from '@/db';
import { isSyncConfigured } from './syncStatus';
import { Login } from '@/routes/Login';
import { Callback } from '@/routes/Callback';
import { Characters } from '@/routes/Characters';
import { Overview } from '@/routes/Overview';
import { Skills } from '@/routes/Skills';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { SkillCompare } from '@/routes/SkillCompare';
import { Industry } from '@/routes/Industry';
import { Market } from '@/routes/Market';
import { Wallet } from '@/routes/Wallet';
import { Clones } from '@/routes/Clones';
import { PlanetaryIndustry } from '@/routes/PlanetaryIndustry';
import { Assets } from '@/routes/Assets';
import { Mail } from '@/routes/Mail';
import { Calendar } from '@/routes/Calendar';
import { Contracts } from '@/routes/Contracts';
import { Contacts } from '@/routes/Contacts';
import { EmploymentHistory } from '@/routes/EmploymentHistory';
import { Orders } from '@/routes/Orders';
import { Settings } from '@/routes/Settings';
import { Styleguide } from '@/routes/Styleguide';
import { Layout } from './Layout';
import { ReloadPrompt } from './ReloadPrompt';
import { WhatsNewPanel } from './WhatsNewPanel';
import { BootScreen } from './BootScreen';
import { RequireCharacter } from './RequireCharacter';
import { ScopeGate } from './ScopeGate';
import { AuthFailureRedirect } from './AuthFailureNotice';
import { getAccessTokenReportingFailures } from './tokenProvider';
import type { AppRoutePath } from './routeScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale } from '@/lib/fontScale';

// Wire authenticated ESI calls to stored tokens once, at module load. Wrapped
// (tokenProvider.ts) so a dead refresh grant is reported centrally instead of
// surfacing as an empty view in whichever feature happened to ask first.
configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });

// Vite's BASE_URL (set by `base` in vite.config.ts, currently '/').
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

/**
 * Every feature route, keyed by path. `satisfies Record<AppRoutePath, ...>` is
 * what makes a route without a scope declaration a *compile* error, in both
 * directions. Do not hand-write a literal route element for a feature route
 * below — it would slip past both checks; `routeScopes.test.ts` scans this
 * file's source to keep that honest.
 */
const ROUTE_ELEMENTS = {
  '/characters': <Characters />,
  '/overview': <Overview />,
  '/skills': <Skills />,
  '/skills/plans': <SkillPlans />,
  '/skills/plans/:planId': <SkillPlanEditor />,
  '/skills/compare': <SkillCompare />,
  '/industry': <Industry />,
  '/market': <Market />,
  '/wallet': <Wallet />,
  '/clones': <Clones />,
  '/planetary-industry': <PlanetaryIndustry />,
  '/employment-history': <EmploymentHistory />,
  '/assets': <Assets />,
  '/mail': <Mail />,
  '/calendar': <Calendar />,
  '/contracts': <Contracts />,
  '/contacts': <Contacts />,
  '/orders': <Orders />,
  '/settings': <Settings />,
} satisfies Record<AppRoutePath, ReactElement>;

// `Object.entries` widens the key back to `string`; the union is the point.
const FEATURE_ROUTES = Object.entries(ROUTE_ELEMENTS) as [AppRoutePath, ReactElement][];

/** Index gate: characters exist -> /characters, none -> /login. */
function Root() {
  const characterCount = useLiveQuery(() => db.characters.count());
  if (characterCount === undefined) return <BootScreen />;
  return <Navigate to={characterCount > 0 ? '/characters' : '/login'} replace />;
}

export function App() {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Applies the stored text-scale to <html> as early as possible, regardless
  // of which route the user lands on — it is not something visiting /settings
  // should be required for.
  const hydrateFontScale = useFontScale((state) => state.hydrate);
  useEffect(() => {
    void hydrateFontScale();
  }, [hydrateFontScale]);

  // `esi` publishes auth failures; the store is subscribed here so `esi` keeps
  // no dependency on `src/stores` (docs/ARCHITECTURE.md §2).
  useEffect(() => subscribeToEsiAuthFailures(), []);

  // Same wiring as the auth-failure signal, for the activity log (issue #32).
  useEffect(() => subscribeToEsiActivity(), []);

  // Fire-and-forget, on app start (once hydration resolves an active character)
  // and every character switch. Errors (offline, no Firebase config) are
  // swallowed — surfaced instead via subscribeSyncStatus.
  useEffect(() => {
    if (activeCharacterId === null || !isSyncConfigured()) return;
    void triggerSync(activeCharacterId).catch(() => {});
  }, [activeCharacterId]);

  return (
    <ErrorBoundary>
      <BrowserRouter basename={BASENAME}>
        <AuthFailureRedirect />
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route path="/callback" element={<Callback />} />
          {/* Below: a logged-in Character, then the route's own scopes. */}
          <Route element={<RequireCharacter />}>
            <Route element={<Layout />}>
              {FEATURE_ROUTES.map(([path, element]) => (
                <Route
                  key={path}
                  path={path}
                  element={<ScopeGate path={path}>{element}</ScopeGate>}
                />
              ))}
            </Route>
          </Route>
          <Route path="/styleguide" element={<Styleguide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ReloadPrompt />
        <WhatsNewPanel />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
