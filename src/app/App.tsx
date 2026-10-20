import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import { withSentryReactRouterV7Routing } from '@sentry/react';
import { ErrorBoundary } from './ErrorBoundary';
import { subscribeToEsiAuthFailures } from '@/stores/authFailure';
import { subscribeToEsiActivity } from '@/stores/activityLog';
import { subscribeToUpgradeBlockedReports } from './upgradeBlockedReport';
import { reloadOnDatabaseWipe } from './databaseWipe';
import { useLiveQuery } from 'dexie-react-hooks';
import { configureEsi } from '@/esi/client';
import { configureActiveCharacter } from '@/esi/lane';
import { triggerSync } from '@/sync';
import { usePublishSharedLibraries } from '@/features/communities/usePublishSharedLibraries';
import { useSyncRequestDeliveries } from '@/features/communities/useSyncRequestDeliveries';
import { db } from '@/db';
import { isSyncConfigured } from './syncStatus';
import { useBackgroundSync } from './backgroundSync';
import { scheduleBootPrefetch, scheduleCachePrune, scheduleLazySdeWarm } from './bootPrefetch';
import { startReconnectRecovery } from './reconnectRecovery';
import { Login } from '@/routes/Login';
import { Callback } from '@/routes/Callback';
import * as routeChunks from './routeChunks';
import { NotFound } from '@/routes/NotFound';
import { preloadedLazy } from './preloadedLazy';
import { writeSignedInShellHint } from './signedInShellHint';
import { AnalyticsPageViewTracker } from './AnalyticsPageViewTracker';
import { LandingShellOffLandingRelease } from './landingShell';
import { DocumentTitleTracker } from './DocumentTitleTracker';
import { StaleStoresReloader } from './StaleStoresReloader';
import { ReloadPrompt } from './ReloadPrompt';
import './installApp'; // registers the beforeinstallprompt listener at boot
import { BootScreen } from './BootScreen';
import { ROUTER_BASENAME } from './routerPath';
import { Spinner } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { RequireCharacter } from './RequireCharacter';
import { ScopeGate } from './ScopeGate';
import { TabRoute } from './TabRoute';
import { PAGE_LEGACY_LOCATIONS, PAGE_TABS, routePatternFor } from './pageTabs';
import { AuthFailureRedirect } from './AuthFailureNotice';
import { LegacyPathRedirect } from './LegacyPathRedirect';
import { AlertsRedirect } from './AlertsRedirect';
import { useHiddenNav, useNavSetupAnswered, useRecentNav } from './navPreferences';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { EntityInfoRoute } from '@/features/entities';
import { ItemInfoModal } from '@/features/entities/ItemInfoModal';
import { PlaceInfoModal } from '@/features/entities/PlaceInfoModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { getAccessTokenReportingFailures } from './tokenProvider';
import type { AppRoutePath } from './routeScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale } from '@/lib/fontScale';
import { decimalMarkFor, useNumberFormat } from '@/lib/numberFormat';
import { useTimeFormat } from '@/lib/timeFormat';
import { useMobileTabs } from '@/lib/mobileTabs';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';

// Wire authenticated ESI calls to stored tokens once, at module load. Wrapped
// (tokenProvider.ts) so a dead refresh grant is reported centrally instead of
// surfacing as an empty view in whichever feature happened to ask first.
configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
// The active Character's reads queue ahead of every other Character's (#2281).
configureActiveCharacter(() => useActiveCharacter.getState().activeCharacterId);

// Code-split routes (`routeChunks.ts`). Login, Callback and NotFound stay
// eager above: a signed-out cold load can land on them before any choice.
// Info modals load on first open (each renders nothing without a request), so
// their tabs, skill plan and price code stay out of the boot chunk.
const LazyPublicInfoModal = lazy(() =>
  routeChunks
    .guarded(() => import('@/components/PublicInfoModal'))
    .then((m) => ({
      default: m.PublicInfoModal,
    }))
);
const LazySkillDetailModal = lazy(() =>
  routeChunks
    .guarded(() => import('@/components/SkillDetailModal'))
    .then((m) => ({
      default: m.SkillDetailModal,
    }))
);

function PublicInfoModal() {
  const open = usePublicInfoModalStore((state) => state.request !== null);
  return open ? (
    <Suspense fallback={null}>
      <LazyPublicInfoModal />
    </Suspense>
  ) : null;
}

function SkillDetailModal() {
  const open = useSkillDetailModalStore((state) => state.request !== null);
  return open ? (
    <Suspense fallback={null}>
      <LazySkillDetailModal />
    </Suspense>
  ) : null;
}

// The signed-in shell is split so a first visit to /login skips it, and
// preloaded at boot for a returning user (`bootShellPreload.ts`) —
// `preloadedLazy` then renders it with no fallback frame once it is in.
const Layout = preloadedLazy(routeChunks.loadLayout);
const Overview = preloadedLazy(routeChunks.loadOverview);
const Characters = lazy(routeChunks.loadCharacters);
const Skills = lazy(routeChunks.loadSkills);
const SkillPlans = lazy(routeChunks.loadSkillPlans);
const SkillPlanEditor = lazy(routeChunks.loadSkillPlanEditor);
const SkillCertificates = lazy(routeChunks.loadSkillCertificates);
const Industry = lazy(routeChunks.loadIndustry);
const IndustryPlanPage = lazy(routeChunks.loadIndustryPlanPage);
const IndustryGroupPage = lazy(routeChunks.loadIndustryGroupPage);
const Ships = lazy(routeChunks.loadShips);
const FittingCompare = lazy(routeChunks.loadFittingCompare);
const Corp = lazy(routeChunks.loadCorp);
const CorpMembers = lazy(routeChunks.loadCorpMembers);
const CorpAssets = lazy(routeChunks.loadCorpAssets);
const CorpMoons = lazy(routeChunks.loadCorpMoons);
const CorpWallet = lazy(routeChunks.loadCorpWallet);
const Market = lazy(routeChunks.loadMarket);
const Wallet = lazy(routeChunks.loadWallet);
const MoonMiningTax = lazy(routeChunks.loadMoonMiningTax);
const LoyaltyStore = lazy(routeChunks.loadLoyaltyStore);
const Clones = lazy(routeChunks.loadClones);
const PlanetaryIndustry = lazy(routeChunks.loadPlanetaryIndustry);
const Assets = lazy(routeChunks.loadAssets);
const Mail = lazy(routeChunks.loadMail);
const Calendar = lazy(routeChunks.loadCalendar);
const Contracts = lazy(routeChunks.loadContracts);
const Communities = lazy(routeChunks.loadCommunities);
const CommunityJoin = lazy(routeChunks.loadCommunityJoin);
const Contacts = lazy(routeChunks.loadContacts);
const Travel = lazy(routeChunks.loadTravel);
const EmploymentHistory = lazy(routeChunks.loadEmploymentHistory);
const Settings = lazy(routeChunks.loadSettings);
const Help = lazy(routeChunks.loadHelp);
const FittingShared = lazy(routeChunks.loadFittingShared);
const SharedLink = lazy(routeChunks.loadSharedLink);
const CorpTaxBookVerify = lazy(routeChunks.loadCorpTaxBookVerify);
const ErrorProbe = lazy(routeChunks.loadErrorProbe);

/**
 * Suspense fallback for the lazy routes outside `Layout` (`/share/fitting`,
 * `/share/:shareId`, `/error`). Feature routes suspend inside `Layout`'s own
 * boundary instead, so the shell stays up. Not `BootScreen`: that one reports
 * a boot stall after ten seconds, and a slow chunk is not a stalled boot.
 */
function RouteFallback() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg text-text">
      <Spinner label={t('common.loading')} />
    </main>
  );
}

/**
 * `<Routes>` with Sentry's route-pattern reporting layered on, so a navigation
 * transaction is named `/skills/plans/:planId` rather than one distinct
 * transaction per plan id. Wrapped once, at the top level only — a nested
 * `<Routes>` must stay unwrapped. Inert unless `instrument.ts` found a DSN.
 */
const SentryRoutes = withSentryReactRouterV7Routing(Routes);

/**
 * `Layout`, loaded as its own chunk (`preloadedLazy`). While it is still on
 * the way the fallback is the screen `RequireCharacter` was just showing, so
 * the hand-off does not jump — without a `gate`, because a slow download is
 * not a stalled boot and the boot recovery would only restart it. A chunk that
 * fails shows the Reload screen, and navigating retries it: the boundary
 * resets on the path, and `preloadedLazy` does not cache the failure.
 */
function SignedInShell() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<BootScreen />}>
        <Layout />
      </Suspense>
    </ErrorBoundary>
  );
}

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
  // Retired page: the bell's panel replaced it, so this just opens that.
  '/alerts': <AlertsRedirect />,
  // The Skills section opens on planning: /skills is an index that redirects,
  // so the rail's own link (and any existing bookmark) lands on the plan list
  // while the trained view keeps a URL of its own.
  '/skills': <Navigate to="/skills/plans" replace />,
  '/skills/trained': <Skills />,
  '/skills/plans': <SkillPlans />,
  '/skills/plans/:planId': <SkillPlanEditor />,
  // Retired page: Compare is a drawer over Trained now (`legacyPaths.ts`).
  '/skills/compare': <LegacyPathRedirect />,
  '/skills/certificates': <SkillCertificates />,
  '/industry': <Industry />,
  '/industry/plans/:planId': <IndustryPlanPage />,
  '/industry/groups/:groupId': <IndustryGroupPage />,
  // A tabbed page (`pageTabs.ts`): the Fittings tab, the editor below it and
  // the Ship Tree are all this one route.
  '/ships': <Ships />,
  '/ships/fittings/compare': <FittingCompare />,
  '/market': <Market />,
  '/wallet': <Wallet />,
  // LP Store is a Wallet tab (it was a Market tab before; `PAGE_LEGACY_LOCATIONS`
  // sends `/market/lp-store` here). Its oldest paths, under `/wallet/loyalty`,
  // redirect for good.
  '/wallet/lp-store': <LoyaltyStore />,
  '/wallet/lp-store/:corporationId': <LoyaltyStore />,
  '/wallet/loyalty': <LegacyPathRedirect />,
  '/wallet/loyalty/:corporationId': <LegacyPathRedirect />,
  '/mining': <MoonMiningTax />,
  '/clones': <Clones />,
  '/planetary-industry': <PlanetaryIndustry />,
  // The Advisor tab retired; the old path redirects for good.
  '/planetary-industry/advisor': <LegacyPathRedirect />,
  '/employment-history': <EmploymentHistory />,
  '/corp': <Corp />,
  '/corp/members': <CorpMembers />,
  '/corp/wallet': <CorpWallet />,
  '/corp/assets': <CorpAssets />,
  '/corp/moons': <CorpMoons />,
  '/corp/assets/*': <CorpAssets />,
  '/assets': <Assets />,
  '/mail': <Mail />,
  '/calendar': <Calendar />,
  '/communities': <Communities />,
  '/contracts': <Contracts />,
  // The BPC search moved into Industry's tab strip; the old path stays as a
  // redirect so bookmarks and any link already in the wild still land on it.
  '/bpc-contracts': <Navigate to={industryTabHref('sourcing')} replace />,
  '/contacts': <Contacts />,
  '/travel': <Travel />,
  // Pilot Lookup is the Travel tab `/travel/pilot`; its short-lived own page redirects there.
  '/pilot-lookup': <LegacyPathRedirect />,
  '/settings': <Settings />,
  // Shortcuts, FAQ and Help left Settings for their own page; the old paths redirect for good.
  '/settings/shortcuts': <LegacyPathRedirect />,
  '/settings/faq': <LegacyPathRedirect />,
  '/settings/help': <LegacyPathRedirect />,
  '/help': <Help />,
} satisfies Record<AppRoutePath, ReactElement>;

// `Object.entries` widens the key back to `string`; the union is the point.
const FEATURE_ROUTES = Object.entries(ROUTE_ELEMENTS) as [AppRoutePath, ReactElement][];

/**
 * Index gate: an active Character -> /overview, characters but none picked ->
 * /characters, none at all -> /login.
 *
 * Overview is what the rail opens with and what a returning user came back
 * for; the character list is a place you go to switch or add one, so landing
 * there every time made every visit start with a step. Waits on the
 * active-character store as well as the count — deciding before hydration
 * resolves would send a returning user to /characters, which Overview's own
 * guard would then have to send back.
 */
function Root() {
  const characterCount = useCharacterCountOrLoading();
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  // A landing section's hash (`/#login-faq`) survives the hop to the page that has it.
  const { hash } = useLocation();
  if (characterCount === undefined || !hydrated) return <BootScreen gate="root" />;
  if (characterCount === 0) return <Navigate to={{ pathname: '/login', hash }} replace />;
  return <Navigate to={activeCharacterId === null ? '/characters' : '/overview'} replace />;
}

const NO_CHARACTER_IDS: number[] = [];

/**
 * Boot wiring and the Dexie/store subscriptions that go with it. Its own
 * component, rendering nothing, so a character change re-renders only this and
 * not the `<BrowserRouter>` tree (and its route table) below.
 */
function AppEffects() {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
  useHydratedStore(useHiddenNav, useRecentNav, useNavSetupAnswered);

  // `esi` publishes auth failures; the store is subscribed here so `esi` keeps
  // no dependency on `src/stores` (docs/ARCHITECTURE.md §2).
  useEffect(() => subscribeToEsiAuthFailures(), []);

  // Same wiring as the auth-failure signal, for the activity log (issue #32).
  useEffect(() => subscribeToEsiActivity(), []);

  // And again for a blocked IndexedDB upgrade — the one Dexie failure that
  // never surfaces as an error, so it needs reporting to exist at all.
  useEffect(() => subscribeToUpgradeBlockedReports(), []);
  useEffect(() => reloadOnDatabaseWipe(), []);
  useEffect(() => scheduleCachePrune(), []);
  useEffect(() => scheduleLazySdeWarm(), []);
  // Back online: drop held failures, re-read, sync, warm what was skipped.
  useEffect(() => startReconnectRecovery(), []);

  // Fire-and-forget, on app start (once hydration resolves an active character)
  // and every character switch. Errors (offline, no Firebase config) are
  // swallowed — surfaced instead via subscribeSyncStatus.
  useEffect(() => {
    if (activeCharacterId === null || !isSyncConfigured()) return;
    void triggerSync(activeCharacterId).catch(() => {});
  }, [activeCharacterId]);

  // The above covers the active Character at boot. This covers the rest of
  // them, and covers a tab that has been open long enough for another device
  // to have changed something — see backgroundSync.ts.
  // One query serves the three consumers and the shell hint below. No default:
  // `undefined` is "not read yet", which must not clear the hint.
  const readIds = useLiveQuery(() => db.characters.toCollection().primaryKeys());
  const characterIds = readIds ?? NO_CHARACTER_IDS;
  useBackgroundSync(characterIds, activeCharacterId);
  // Keeps what Characters share with their Communities current (issue #3600).
  usePublishSharedLibraries(characterIds, activeCharacterId);
  // Marks Request Pledges delivered from finished contracts (issue #3809).
  useSyncRequestDeliveries(characterIds, activeCharacterId);

  // Keeps `bootShellPreload.ts`'s hint in step with Dexie, so the next cold
  // load knows to fetch the signed-in shell early.
  const characterCount = readIds?.length;
  useEffect(() => {
    if (characterCount !== undefined) writeSignedInShellHint(characterCount > 0);
  }, [characterCount]);

  // Same shape, for API-derived data: warm every granted surface into Dexie at
  // boot so a later page opens from cache rather than the network. Cancelled on
  // character switch so a slow run cannot keep spending requests for a
  // character the user has already left. Deferred to an idle slot and loaded
  // as its own chunk (`bootPrefetch.ts`), so it neither weighs on the startup
  // bundle nor races the visible route's own reads.
  useEffect(() => {
    if (activeCharacterId === null) return;
    return scheduleBootPrefetch(activeCharacterId);
  }, [activeCharacterId]);

  return null;
}

export function App() {
  // Formatters read the number format when they run rather than subscribing,
  // so a change would leave what is on screen in the old format. Keying the
  // routes on the resolved mark remounts them once, when the mark changes
  // (switching `auto` to the format it already resolves to does nothing).
  const numberMark = decimalMarkFor(useNumberFormat((state) => state.value));

  return (
    <ErrorBoundary>
      <AppEffects />
      <BrowserRouter basename={ROUTER_BASENAME}>
        <AuthFailureRedirect />
        <AnalyticsPageViewTracker />
        <LandingShellOffLandingRelease />
        <DocumentTitleTracker />
        <StaleStoresReloader />
        <Suspense key={numberMark} fallback={<RouteFallback />}>
          <SentryRoutes>
            <Route path="/" element={<Root />} />
            <Route path="/login" element={<Login />} />
            <Route path="/callback" element={<Callback />} />
            {/* Below: a logged-in Character, then the route's own scopes. */}
            <Route element={<RequireCharacter />}>
              <Route element={<SignedInShell />}>
                {/* A tabbed page (`pageTabs.ts`) mounts once at `<path>/*`, so
                  its tabs are one route instance: switching tab keeps the
                  page mounted, and none of the tables above gain an entry. */}
                {FEATURE_ROUTES.map(([path, element]) => {
                  const tabs = PAGE_TABS[path];
                  const gated = <ScopeGate path={path}>{element}</ScopeGate>;
                  return (
                    <Route
                      key={path}
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
                  );
                })}
              </Route>
            </Route>
            {/* A Fitting Share Code opened with no session (#1544) — it must
              open with no Character, so it sits outside
              RequireCharacter/ScopeGate. A
              visitor with a Character never sees it: FittingShared redirects
              straight into the editor instead. routeScopes.test.ts asserts
              this exemption is deliberate. */}
            <Route path="/share/fitting" element={<FittingShared />} />
            {/* A Share Link (`/s/<id>`), for any share type — same
              exemption. `/share/<id>` is the old spelling of the same link
              (ids minted before the short key), kept so links already sent
              still open; the literal `/share/fitting` above outranks it. */}
            <Route path="/s/:shareId" element={<SharedLink />} />
            {/* The invite link: a signed-out visitor sees what it is for before logging in. */}
            <Route path="/communities/join/:code" element={<CommunityJoin />} />
            <Route path="/share/:shareId" element={<SharedLink />} />
            {/* A Statement's verify link (#4066): read-only, no login, the token is the credential. */}
            <Route path="/corp-tax-book/verify/:token" element={<CorpTaxBookVerify />} />
            {/* Undisclosed Sentry probe — see routes/ErrorProbe.tsx. */}
            <Route path="/error" element={<ErrorProbe />} />
            <Route path="*" element={<NotFound />} />
          </SentryRoutes>
        </Suspense>
        <ReloadPrompt />
        <EntityInfoRoute />
        <PublicInfoModal />
        <SkillDetailModal />
        <ItemInfoModal />
        <PlaceInfoModal />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
