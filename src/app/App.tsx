import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import { withSentryReactRouterV7Routing } from '@sentry/react';
import { ErrorBoundary } from './ErrorBoundary';
import { subscribeToEsiActivity } from '@/stores/activityLog';
import { subscribeToUpgradeBlockedReports } from './upgradeBlockedReport';
import { reloadOnDatabaseWipe } from './databaseWipe';
import { useLiveQuery } from 'dexie-react-hooks';
import { triggerSync } from '@/sync';
import { usePublishSharedLibraries } from '@/features/communities/usePublishSharedLibraries';
import { useSyncRequestDeliveries } from '@/features/communities/useSyncRequestDeliveries';
import { db } from '@/db';
import { isSyncConfigured } from './syncStatus';
import { useBackgroundSync } from './backgroundSync';
import { usePlayerClaim } from './usePlayerClaim';
import { scheduleBootPrefetch, scheduleCachePrune, scheduleLazySdeWarm } from './bootPrefetch';
import { scheduleBootSync } from './bootSync';
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
import './installApp';
import { BootScreen } from './BootScreen';
import { ROUTER_BASENAME } from './routerPath';
import { Spinner, TooltipProvider } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { RequireCharacter } from './RequireCharacter';
import { routePatternFor } from './pageTabs';
import { configureAppEsi, featureRouteElement, useAppStateHydration } from './appWiring';
import { InfoModals } from './InfoModals';
import { AuthFailureRedirect } from './AuthFailureNotice';
import { LegacyPathRedirect } from './LegacyPathRedirect';
import { AlertsRedirect } from './AlertsRedirect';
import { SkillsIndexRedirect } from './SkillsIndexRedirect';
import type { AppRoutePath } from './routeScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useNumberFormat } from '@/lib/numberFormat';
import { requestPersistenceWhenInstalled } from '@/lib/persistStorage';
import { checkStorageAtRisk } from '@/features/settings/storageAtRisk';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';

configureAppEsi();

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
const CorpStructures = lazy(routeChunks.loadCorpStructures);
const CorpMoons = lazy(routeChunks.loadCorpMoons);
const CorpSrp = lazy(routeChunks.loadCorpSrp);
const Srp = lazy(routeChunks.loadSrp);
const CorpVetting = lazy(routeChunks.loadCorpVetting);
const VettingRequest = lazy(routeChunks.loadVettingRequest);
const Apply = lazy(routeChunks.loadApply);
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
const SurveyStart = lazy(routeChunks.loadSurveyStart);
const CorpTaxBookVerify = lazy(routeChunks.loadCorpTaxBookVerify);
const CorpTaxBookRemoveNow = lazy(routeChunks.loadCorpTaxBookRemoveNow);
const ErrorProbe = lazy(routeChunks.loadErrorProbe);

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg text-text">
      <Spinner label={t('common.loading')} />
    </main>
  );
}

const SentryRoutes = withSentryReactRouterV7Routing(Routes);

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

const ROUTE_ELEMENTS = {
  '/characters': <Characters />,
  '/overview': <Overview />,
  '/alerts': <AlertsRedirect />,
  '/skills': <SkillsIndexRedirect />,
  '/skills/trained': <Skills />,
  '/skills/plans': <SkillPlans />,
  '/skills/plans/:planId': <SkillPlanEditor />,
  '/skills/compare': <LegacyPathRedirect />,
  '/skills/certificates': <SkillCertificates />,
  '/industry': <Industry />,
  '/industry/plans/:planId': <IndustryPlanPage />,
  '/industry/groups/:groupId': <IndustryGroupPage />,
  '/ships': <Ships />,
  '/ships/fittings/compare': <FittingCompare />,
  '/market': <Market />,
  '/wallet': <Wallet />,
  '/wallet/lp-store': <LoyaltyStore />,
  '/wallet/lp-store/:corporationId': <LoyaltyStore />,
  '/wallet/loyalty': <LegacyPathRedirect />,
  '/wallet/loyalty/:corporationId': <LegacyPathRedirect />,
  '/mining': <MoonMiningTax />,
  '/clones': <Clones />,
  '/planetary-industry': <PlanetaryIndustry />,
  '/planetary-industry/advisor': <LegacyPathRedirect />,
  '/employment-history': <EmploymentHistory />,
  '/corp': <Corp />,
  '/corp/members': <CorpMembers />,
  '/corp/wallet': <CorpWallet />,
  '/corp/assets': <CorpAssets />,
  '/corp/structures': <CorpStructures />,
  '/corp/moons': <CorpMoons />,
  '/corp/srp': <CorpSrp />,
  '/srp': <Srp />,
  '/corp/vetting': <CorpVetting />,
  '/vetting': <VettingRequest />,
  '/corp/assets/*': <CorpAssets />,
  '/assets': <Assets />,
  '/mail': <Mail />,
  '/calendar': <Calendar />,
  '/communities': <Communities />,
  '/contracts': <Contracts />,
  '/bpc-contracts': <Navigate to={industryTabHref('sourcing')} replace />,
  '/contacts': <Contacts />,
  '/travel': <Travel />,
  '/pilot-lookup': <LegacyPathRedirect />,
  '/settings': <Settings />,
  '/settings/shortcuts': <LegacyPathRedirect />,
  '/settings/faq': <LegacyPathRedirect />,
  '/settings/help': <LegacyPathRedirect />,
  '/help': <Help />,
} satisfies Record<AppRoutePath, ReactElement>;

const FEATURE_ROUTES = Object.entries(ROUTE_ELEMENTS) as [AppRoutePath, ReactElement][];

function Root() {
  const characterCount = useCharacterCountOrLoading();
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { hash } = useLocation();
  if (characterCount === undefined || !hydrated) return <BootScreen gate="root" />;
  if (characterCount === 0) return <Navigate to={{ pathname: '/login', hash }} replace />;
  return <Navigate to={activeCharacterId === null ? '/characters' : '/overview'} replace />;
}

const NO_CHARACTER_IDS: number[] = [];

function AppEffects() {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  useAppStateHydration();

  useEffect(() => subscribeToEsiActivity(), []);

  useEffect(() => subscribeToUpgradeBlockedReports(), []);
  useEffect(() => reloadOnDatabaseWipe(), []);
  useEffect(() => scheduleCachePrune(), []);
  useEffect(() => scheduleLazySdeWarm(), []);
  useEffect(() => {
    void requestPersistenceWhenInstalled()
      .then(() => checkStorageAtRisk())
      .catch(() => undefined);
  }, []);
  useEffect(() => startReconnectRecovery(), []);

  useEffect(() => {
    if (activeCharacterId === null || !isSyncConfigured()) return;
    return scheduleBootSync(activeCharacterId, (id) => {
      void triggerSync(id).catch(() => {});
    });
  }, [activeCharacterId]);

  const readIds = useLiveQuery(() => db.characters.toCollection().primaryKeys());
  const characterIds = readIds ?? NO_CHARACTER_IDS;
  useBackgroundSync(characterIds, activeCharacterId);
  usePlayerClaim(characterIds);
  usePublishSharedLibraries(characterIds, activeCharacterId);
  useSyncRequestDeliveries(characterIds, activeCharacterId);

  const characterCount = readIds?.length;
  useEffect(() => {
    if (characterCount !== undefined) writeSignedInShellHint(characterCount > 0);
  }, [characterCount]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    return scheduleBootPrefetch(activeCharacterId);
  }, [activeCharacterId]);

  return null;
}

export function App() {
  const numberStyle = useNumberFormat((state) => state.value);

  return (
    <ErrorBoundary>
      <AppEffects />
      <TooltipProvider>
        <BrowserRouter basename={ROUTER_BASENAME}>
          <AuthFailureRedirect />
          <AnalyticsPageViewTracker />
          <LandingShellOffLandingRelease />
          <DocumentTitleTracker />
          <StaleStoresReloader />
          <Suspense key={numberStyle} fallback={<RouteFallback />}>
            <SentryRoutes>
              <Route path="/" element={<Root />} />
              <Route path="/login" element={<Login />} />
              <Route path="/callback" element={<Callback />} />
              <Route element={<RequireCharacter />}>
                <Route element={<SignedInShell />}>
                  {FEATURE_ROUTES.map(([path, element]) => (
                    <Route
                      key={path}
                      path={routePatternFor(path)}
                      element={featureRouteElement(path, element)}
                    />
                  ))}
                </Route>
              </Route>
              <Route path="/share/fitting" element={<FittingShared />} />
              <Route path="/s/:shareId" element={<SharedLink />} />
              <Route path="/survey" element={<SurveyStart />} />
              <Route path="/apply/:corpId" element={<Apply />} />
              <Route path="/communities/join/:code" element={<CommunityJoin />} />
              <Route path="/share/:shareId" element={<SharedLink />} />
              <Route path="/corp-tax-book/verify/:token" element={<CorpTaxBookVerify />} />
              <Route path="/corp-tax-book/remove-now/:code" element={<CorpTaxBookRemoveNow />} />
              <Route path="/error" element={<ErrorProbe />} />
              <Route path="*" element={<NotFound />} />
            </SentryRoutes>
          </Suspense>
          <ReloadPrompt />
          <InfoModals />
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
