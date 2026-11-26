import type { ComponentType } from 'react';
import type { AppRoutePath } from './routeScopes';
import { staleBuildRecoveryOutcome } from './staleBuildState';

type RouteModule = { default: ComponentType };

export function named<M extends Record<K, unknown>, K extends keyof M & string>(
  importer: () => Promise<M>,
  key: K
): () => Promise<{ default: M[K] }> {
  return () => guarded(importer).then((m) => ({ default: m[key] }));
}

class RouteChunkUnavailableError extends Error {
  constructor() {
    super('Route chunk unavailable');
    this.name = 'RouteChunkUnavailableError';
  }
}

export function guarded<M>(importer: () => Promise<M | undefined>): Promise<M> {
  return importer().then((m) => {
    if (m) return m;
    const recovery = staleBuildRecoveryOutcome();
    return (recovery ?? Promise.resolve(false)).then((reloading) => {
      if (reloading) return new Promise<never>(() => {});
      throw new RouteChunkUnavailableError();
    });
  });
}

const DYNAMIC_IMPORT_FAILURE = /dynamically imported module|importing a module script failed/i;

export function isRouteChunkFailure(error: unknown): boolean {
  if (error instanceof RouteChunkUnavailableError) return true;
  return error instanceof TypeError && DYNAMIC_IMPORT_FAILURE.test(error.message);
}

export interface RememberedLoader<P extends object = object> {
  (): Promise<{ default: ComponentType<P> }>;
  peek(): ComponentType<P> | undefined;
}

export function remembered<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>
): RememberedLoader<P> {
  let pending: Promise<{ default: ComponentType<P> }> | undefined;
  let loaded: ComponentType<P> | undefined;
  const load = () =>
    (pending ??= loader().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      }
    ));
  return Object.assign(load, { peek: () => loaded });
}

export const loadLayout = remembered(named(() => import('./Layout'), 'Layout'));
export const loadOverview = remembered(named(() => import('@/routes/Overview'), 'Overview'));
export const loadCharacters = named(() => import('@/routes/Characters'), 'Characters');
export const loadSkills = named(() => import('@/routes/Skills'), 'Skills');
export const loadSkillPlans = named(() => import('@/routes/SkillPlans'), 'SkillPlans');
export const loadSkillPlanEditor = named(
  () => import('@/routes/SkillPlanEditor'),
  'SkillPlanEditor'
);
export const loadSkillCertificates = named(
  () => import('@/routes/SkillCertificates'),
  'SkillCertificates'
);
export const loadIndustry = named(() => import('@/routes/Industry'), 'Industry');
export const loadIndustryPlanPage = named(
  () => import('@/routes/IndustryPlanPage'),
  'IndustryPlanPage'
);
export const loadIndustryGroupPage = named(
  () => import('@/routes/IndustryGroupPage'),
  'IndustryGroupPage'
);
export const loadShips = named(() => import('@/routes/Ships'), 'Ships');
export const loadFittingCompare = named(() => import('@/routes/FittingCompare'), 'FittingCompare');
export const loadCorp = named(() => import('@/routes/Corp'), 'Corp');
export const loadCorpMembers = named(() => import('@/routes/CorpMembers'), 'CorpMembers');
export const loadCorpAssets = named(() => import('@/routes/CorpAssets'), 'CorpAssets');
export const loadCorpStructures = named(() => import('@/routes/CorpStructures'), 'CorpStructures');
export const loadCorpWallet = named(() => import('@/routes/CorpWallet'), 'CorpWallet');
export const loadCorpMoons = named(() => import('@/routes/CorpMoons'), 'CorpMoons');
export const loadCorpSrp = named(() => import('@/routes/CorpSrp'), 'CorpSrp');
export const loadSrp = named(() => import('@/routes/Srp'), 'Srp');
export const loadCorpVetting = named(() => import('@/routes/CorpVetting'), 'CorpVetting');
export const loadVettingRequest = named(() => import('@/routes/VettingRequest'), 'VettingRequest');
export const loadApply = named(() => import('@/routes/Apply'), 'Apply');
export const loadMarket = named(() => import('@/routes/Market'), 'Market');
export const loadWallet = named(() => import('@/routes/Wallet'), 'Wallet');
export const loadMoonMiningTax = named(() => import('@/routes/MoonMiningTax'), 'MoonMiningTax');
export const loadLoyaltyStore = named(() => import('@/routes/LoyaltyStore'), 'LoyaltyStore');
export const loadClones = named(() => import('@/routes/Clones'), 'Clones');
export const loadPlanetaryIndustry = named(
  () => import('@/routes/PlanetaryIndustry'),
  'PlanetaryIndustry'
);
export const loadAssets = named(() => import('@/routes/Assets'), 'Assets');
export const loadMail = named(() => import('@/routes/Mail'), 'Mail');
export const loadCalendar = named(() => import('@/routes/Calendar'), 'Calendar');
export const loadContracts = named(() => import('@/routes/Contracts'), 'Contracts');
export const loadCommunities = named(() => import('@/routes/Communities'), 'Communities');
export const loadContacts = named(() => import('@/routes/Contacts'), 'Contacts');
export const loadTravel = named(() => import('@/routes/Travel'), 'Travel');
export const loadEmploymentHistory = named(
  () => import('@/routes/EmploymentHistory'),
  'EmploymentHistory'
);
export const loadSettings = named(() => import('@/routes/Settings'), 'Settings');
export const loadHelp = named(() => import('@/routes/Help'), 'Help');
export const loadFittingShared = named(() => import('@/routes/FittingShared'), 'FittingShared');
export const loadCommunityJoin = named(() => import('@/routes/CommunityJoin'), 'CommunityJoin');
export const loadSurveyStart = named(() => import('@/routes/SurveyStart'), 'SurveyStart');
export const loadSharedLink = named(() => import('@/routes/SharedLink'), 'SharedLink');
export const loadCorpTaxBookVerify = named(
  () => import('@/routes/CorpTaxBookVerify'),
  'CorpTaxBookVerify'
);
export const loadCorpTaxBookRemoveNow = named(
  () => import('@/routes/CorpTaxBookRemoveNow'),
  'CorpTaxBookRemoveNow'
);
export const loadErrorProbe = named(() => import('@/routes/ErrorProbe'), 'ErrorProbe');

const PRELOADERS: Record<AppRoutePath, () => Promise<RouteModule>> = {
  '/characters': loadCharacters,
  '/overview': loadOverview,
  '/alerts': loadOverview,
  '/skills': loadSkillPlans,
  '/skills/trained': loadSkills,
  '/skills/compare': loadSkills,
  '/skills/plans': loadSkillPlans,
  '/skills/plans/:planId': loadSkillPlanEditor,
  '/skills/certificates': loadSkillCertificates,
  '/industry': loadIndustry,
  '/industry/plans/:planId': loadIndustryPlanPage,
  '/industry/groups/:groupId': loadIndustryGroupPage,
  '/ships': loadShips,
  '/ships/fittings/compare': loadFittingCompare,
  '/market': loadMarket,
  '/wallet': loadWallet,
  '/wallet/lp-store': loadLoyaltyStore,
  '/wallet/lp-store/:corporationId': loadLoyaltyStore,
  '/wallet/loyalty': loadLoyaltyStore,
  '/wallet/loyalty/:corporationId': loadLoyaltyStore,
  '/mining': loadMoonMiningTax,
  '/clones': loadClones,
  '/planetary-industry': loadPlanetaryIndustry,
  '/planetary-industry/advisor': loadPlanetaryIndustry,
  '/employment-history': loadEmploymentHistory,
  '/corp': loadCorp,
  '/corp/members': loadCorpMembers,
  '/corp/wallet': loadCorpWallet,
  '/corp/assets': loadCorpAssets,
  '/corp/structures': loadCorpStructures,
  '/corp/moons': loadCorpMoons,
  '/corp/srp': loadCorpSrp,
  '/srp': loadSrp,
  '/corp/vetting': loadCorpVetting,
  '/vetting': loadVettingRequest,
  '/corp/assets/*': loadCorpAssets,
  '/assets': loadAssets,
  '/mail': loadMail,
  '/calendar': loadCalendar,
  '/communities': loadCommunities,
  '/contracts': loadContracts,
  '/bpc-contracts': loadIndustry,
  '/contacts': loadContacts,
  '/travel': loadTravel,
  '/pilot-lookup': loadTravel,
  '/settings': loadSettings,
  '/settings/shortcuts': loadHelp,
  '/settings/faq': loadHelp,
  '/settings/help': loadHelp,
  '/help': loadHelp,
};

export function preloadRouteChunk(path: AppRoutePath): void {
  preloadChunk(PRELOADERS[path]);
}

export function preloadChunk(load: () => Promise<unknown>): void {
  void load().catch(() => {});
}

export function preloadFrom(loaders: Record<string, () => Promise<unknown>>): (id: string) => void {
  return (id) => {
    if (Object.hasOwn(loaders, id)) preloadChunk(loaders[id]);
  };
}

export function preloadSignedInShell(): void {
  void loadLayout().catch(() => {});
  preloadRouteChunk('/overview');
}
