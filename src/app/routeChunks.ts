/**
 * Route code-splitting: one chunk per page, fetched on first visit.
 *
 * Before this, `App.tsx` imported every route statically, so the whole app —
 * Industry, Market, PI, Skills, Corp, the styleguide — was one entry chunk the
 * browser pulled and parsed before the login screen could paint. Each loader
 * here is a separate `import()`, which is what gives Rollup a chunk boundary.
 *
 * The eager routes are the ones a cold load can land on before any choice is
 * made — `Login`, `Callback`, `Overview` (the index redirect's target) and
 * `NotFound` — and stay static in `App.tsx`; a lazy one would only add a
 * fallback frame to the first paint.
 *
 * `Layout`'s nav items call `preloadRouteChunk` on hover/focus, beside
 * `warmRoute`, so the chunk is usually in flight before the click. Every call
 * goes through the same loader function, and the module registry dedupes
 * repeat `import()`s, so a preload and the later `lazy()` render share one
 * request.
 */
import type { ComponentType } from 'react';
import type { AppRoutePath } from './routeScopes';

type RouteModule = { default: ComponentType };

/**
 * Route files use named exports, and `lazy()` wants `{ default }`: re-shape
 * the module here rather than giving every route file a default export. The
 * `import()` stays a literal at each call site — that is what Rollup splits on.
 *
 * A module of `undefined` means the chunk failed and `main.tsx`'s
 * `vite:preloadError` handler cancelled the failure to reload the page — Vite's
 * preload helper then resolves `undefined` instead of rejecting. Stay pending
 * so the route's Suspense fallback holds until the reload lands, rather than
 * throwing into its error boundary for a moment first.
 */
export function named<K extends string>(
  importer: () => Promise<Record<K, ComponentType>>,
  key: K
): () => Promise<RouteModule> {
  return () =>
    importer().then((m: Record<K, ComponentType> | undefined) =>
      m ? { default: m[key] } : new Promise<never>(() => {})
    );
}

export const loadCharacters = named(() => import('@/routes/Characters'), 'Characters');
export const loadAlerts = named(() => import('@/routes/Alerts'), 'Alerts');
export const loadSkills = named(() => import('@/routes/Skills'), 'Skills');
export const loadSkillPlans = named(() => import('@/routes/SkillPlans'), 'SkillPlans');
export const loadSkillPlanEditor = named(
  () => import('@/routes/SkillPlanEditor'),
  'SkillPlanEditor'
);
export const loadSkillCompare = named(() => import('@/routes/SkillCompare'), 'SkillCompare');
export const loadSkillShips = named(() => import('@/routes/SkillShips'), 'SkillShips');
export const loadIndustry = named(() => import('@/routes/Industry'), 'Industry');
export const loadIndustryPlanPage = named(
  () => import('@/routes/IndustryPlanPage'),
  'IndustryPlanPage'
);
export const loadIndustryGroupPage = named(
  () => import('@/routes/IndustryGroupPage'),
  'IndustryGroupPage'
);
export const loadFittings = named(() => import('@/routes/Fittings'), 'Fittings');
export const loadFittingCompare = named(() => import('@/routes/FittingCompare'), 'FittingCompare');
export const loadCorp = named(() => import('@/routes/Corp'), 'Corp');
export const loadCorpMembers = named(() => import('@/routes/CorpMembers'), 'CorpMembers');
export const loadCorpAssets = named(() => import('@/routes/CorpAssets'), 'CorpAssets');
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
export const loadContacts = named(() => import('@/routes/Contacts'), 'Contacts');
export const loadEmploymentHistory = named(
  () => import('@/routes/EmploymentHistory'),
  'EmploymentHistory'
);
export const loadSettings = named(() => import('@/routes/Settings'), 'Settings');
export const loadStyleguide = named(() => import('@/routes/Styleguide'), 'Styleguide');
export const loadAppraisalShared = named(
  () => import('@/routes/AppraisalShared'),
  'AppraisalShared'
);
export const loadFittingShared = named(() => import('@/routes/FittingShared'), 'FittingShared');
export const loadErrorProbe = named(() => import('@/routes/ErrorProbe'), 'ErrorProbe');

/**
 * Every feature route but the eager `/overview`, keyed the way `Layout`'s
 * links are. Exhaustive by type, so a route added to `routeScopes.ts` without
 * a chunk here is a compile error rather than a link that never preloads. The
 * redirect-only paths (`/skills`, `/bpc-contracts`) preload their target.
 */
const PRELOADERS: Record<Exclude<AppRoutePath, '/overview'>, () => Promise<RouteModule>> = {
  '/characters': loadCharacters,
  '/alerts': loadAlerts,
  '/skills': loadSkillPlans,
  '/skills/trained': loadSkills,
  '/skills/plans': loadSkillPlans,
  '/skills/plans/:planId': loadSkillPlanEditor,
  '/skills/compare': loadSkillCompare,
  '/skills/ships': loadSkillShips,
  '/industry': loadIndustry,
  '/industry/plans/:planId': loadIndustryPlanPage,
  '/industry/groups/:groupId': loadIndustryGroupPage,
  '/fittings': loadFittings,
  '/fittings/edit': loadFittings,
  '/fittings/compare': loadFittingCompare,
  '/market': loadMarket,
  '/wallet': loadWallet,
  '/wallet/loyalty/:corporationId': loadLoyaltyStore,
  '/mining': loadMoonMiningTax,
  '/clones': loadClones,
  '/planetary-industry': loadPlanetaryIndustry,
  '/employment-history': loadEmploymentHistory,
  '/corp': loadCorp,
  '/corp/members': loadCorpMembers,
  '/corp/assets': loadCorpAssets,
  '/corp/assets/*': loadCorpAssets,
  '/assets': loadAssets,
  '/assets/*': loadAssets,
  '/mail': loadMail,
  '/calendar': loadCalendar,
  '/contracts': loadContracts,
  '/bpc-contracts': loadIndustry,
  '/contacts': loadContacts,
  '/settings': loadSettings,
};

/**
 * Start fetching a route's chunk. Fire-and-forget and never rejects: a failed
 * preload (offline, a deploy swapped the hashes) is retried by the real
 * `lazy()` render, which is where an error belongs.
 */
export function preloadRouteChunk(path: AppRoutePath): void {
  if (path === '/overview') return;
  void PRELOADERS[path]().catch(() => {});
}
