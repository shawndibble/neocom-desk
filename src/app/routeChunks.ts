/**
 * Route code-splitting: one chunk per page, fetched on first visit.
 *
 * Before this, `App.tsx` imported every route statically, so the whole app —
 * Industry, Market, PI, Skills, Corp, the styleguide — was one entry chunk the
 * browser pulled and parsed before the login screen could paint. Each loader
 * here is a separate `import()`, which is what gives Rollup a chunk boundary.
 *
 * The eager routes are the ones a signed-out cold load can land on before any
 * choice is made — `Login`, `Callback` and `NotFound` — and stay static in
 * `App.tsx`; a lazy one would only add a fallback frame to the first paint.
 * The signed-in shell (`Layout`, and `Overview`, the index redirect's target)
 * is split too, so a first-time visitor on /login does not download it; a
 * returning user's boot preloads it instead (`preloadSignedInShell`, fired
 * from `bootShellPreload.ts`).
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

/** A loader that also hands back its component synchronously once loaded. */
export interface RememberedLoader<P extends object = object> {
  (): Promise<{ default: ComponentType<P> }>;
  /** The loaded component, or `undefined` until the chunk has arrived. */
  peek(): ComponentType<P> | undefined;
}

/**
 * Memoise a loader and keep its result, so a preload fired at boot and the
 * route's later render share one request — and so the render can use the
 * component outright if the preload already finished (`preloadedLazy.tsx`),
 * instead of suspending for a tick it does not need. A failed load is
 * forgotten, leaving the render free to retry it.
 */
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

// The signed-in shell: every route but the signed-out ones renders inside
// `Layout`, and `/overview` is where the index redirect sends a returning user.
export const loadLayout = remembered(named(() => import('./Layout'), 'Layout'));
export const loadOverview = remembered(named(() => import('@/routes/Overview'), 'Overview'));
export const loadCharacters = named(() => import('@/routes/Characters'), 'Characters');
export const loadAlerts = named(() => import('@/routes/Alerts'), 'Alerts');
export const loadSkills = named(() => import('@/routes/Skills'), 'Skills');
export const loadSkillPlans = named(() => import('@/routes/SkillPlans'), 'SkillPlans');
export const loadSkillPlanEditor = named(
  () => import('@/routes/SkillPlanEditor'),
  'SkillPlanEditor'
);
export const loadSkillCompare = named(() => import('@/routes/SkillCompare'), 'SkillCompare');
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
export const loadCorpWallet = named(() => import('@/routes/CorpWallet'), 'CorpWallet');
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
export const loadTravel = named(() => import('@/routes/Travel'), 'Travel');
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
 * Every feature route, keyed the way `Layout`'s links are. Exhaustive by type, so a route added to `routeScopes.ts` without
 * a chunk here is a compile error rather than a link that never preloads. The
 * redirect-only paths (`/skills`, `/bpc-contracts`, `/skills/ships`,
 * `/fittings/*`) preload their target.
 */
const PRELOADERS: Record<AppRoutePath, () => Promise<RouteModule>> = {
  '/characters': loadCharacters,
  '/overview': loadOverview,
  '/alerts': loadAlerts,
  '/skills': loadSkillPlans,
  '/skills/trained': loadSkills,
  '/skills/plans': loadSkillPlans,
  '/skills/plans/:planId': loadSkillPlanEditor,
  '/skills/compare': loadSkillCompare,
  '/industry': loadIndustry,
  '/industry/plans/:planId': loadIndustryPlanPage,
  '/industry/groups/:groupId': loadIndustryGroupPage,
  '/ships': loadShips,
  '/skills/ships': loadShips,
  '/fittings/*': loadShips,
  '/ships/fittings/compare': loadFittingCompare,
  '/market': loadMarket,
  '/wallet': loadWallet,
  '/wallet/loyalty': loadLoyaltyStore,
  '/wallet/loyalty/:corporationId': loadLoyaltyStore,
  '/mining': loadMoonMiningTax,
  '/clones': loadClones,
  '/planetary-industry': loadPlanetaryIndustry,
  '/employment-history': loadEmploymentHistory,
  '/corp': loadCorp,
  '/corp/members': loadCorpMembers,
  '/corp/wallet': loadCorpWallet,
  '/corp/assets': loadCorpAssets,
  '/corp/assets/*': loadCorpAssets,
  '/assets': loadAssets,
  '/assets/*': loadAssets,
  '/mail': loadMail,
  '/calendar': loadCalendar,
  '/contracts': loadContracts,
  '/bpc-contracts': loadIndustry,
  '/contacts': loadContacts,
  '/travel': loadTravel,
  '/settings': loadSettings,
};

/**
 * Start fetching a route's chunk. Fire-and-forget and never rejects: a failed
 * preload (offline, a deploy swapped the hashes) is retried by the real
 * `lazy()` render, which is where an error belongs.
 */
export function preloadRouteChunk(path: AppRoutePath): void {
  void PRELOADERS[path]().catch(() => {});
}

/**
 * Start fetching the signed-in shell — `Layout` and the `Overview` the index
 * redirect lands on — so a returning user's chunks load alongside React's boot
 * and the Dexie read that gates the route, rather than after it. Same
 * fire-and-forget contract as `preloadRouteChunk`.
 */
export function preloadSignedInShell(): void {
  void loadLayout().catch(() => {});
  preloadRouteChunk('/overview');
}
