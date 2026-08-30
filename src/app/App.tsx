import { useEffect, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { Industry } from '@/routes/Industry';
import { Market } from '@/routes/Market';
import { Wallet } from '@/routes/Wallet';
import { Assets } from '@/routes/Assets';
import { Mail } from '@/routes/Mail';
import { Calendar } from '@/routes/Calendar';
import { Contracts } from '@/routes/Contracts';
import { Orders } from '@/routes/Orders';
import { Styleguide } from '@/routes/Styleguide';
import { Layout } from './Layout';
import { ReloadPrompt } from './ReloadPrompt';
import { BootScreen } from './BootScreen';
import { RequireCharacter } from './RequireCharacter';
import { ScopeGate } from './ScopeGate';
import { AuthFailureRedirect } from './AuthFailureNotice';
import { getAccessTokenReportingFailures } from './tokenProvider';
import type { AppRoutePath } from './routeScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';

// Wire authenticated ESI calls to stored tokens once, at module load. The
// provider is wrapped (tokenProvider.ts) so a dead refresh grant is reported
// centrally instead of surfacing as an empty view in whichever feature
// happened to ask first.
configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });

// '/neocom-desk/' on GitHub Pages, '/' in dev/tests.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

/**
 * Every feature route, keyed by path. `satisfies Record<AppRoutePath, ...>` is
 * what makes a route without a scope declaration a *compile* error: an entry
 * missing from `routeScopes.ROUTE_REQUIREMENTS` fails the excess-property
 * check, and one missing here fails the completeness check. Same trick, same
 * reason, as `esi/registry.ts`'s endpoint table.
 *
 * Do not hand-write a literal `Route` element for a feature route below — it
 * would slip past both checks. `routeScopes.test.ts` scans this file's source
 * to keep that honest.
 */
const ROUTE_ELEMENTS = {
  '/characters': <Characters />,
  '/overview': <Overview />,
  '/skills': <Skills />,
  '/skills/plans': <SkillPlans />,
  '/industry': <Industry />,
  '/market': <Market />,
  '/wallet': <Wallet />,
  '/assets': <Assets />,
  '/mail': <Mail />,
  '/calendar': <Calendar />,
  '/contracts': <Contracts />,
  '/orders': <Orders />,
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

  // Fire-and-forget: runs on app start (once hydration resolves an active
  // character) and again on every character switch. Errors (offline, no
  // Firebase config) are swallowed — surfaced instead via subscribeSyncStatus.
  useEffect(() => {
    if (activeCharacterId === null || !isSyncConfigured()) return;
    void triggerSync(activeCharacterId).catch(() => {});
  }, [activeCharacterId]);

  return (
    <BrowserRouter basename={BASENAME}>
      <AuthFailureRedirect />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        {/* Everything below needs a logged-in Character (auth gate), and then
            per-route, the scopes that route's endpoints need (scope gate). */}
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
    </BrowserRouter>
  );
}
