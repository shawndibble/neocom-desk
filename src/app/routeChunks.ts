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

// Named exports, not default: `lazy()` wants `{ default }`, so each loader
// re-shapes its module rather than every route file changing its export.
export const loadCharacters = () =>
  import('@/routes/Characters').then((m): RouteModule => ({ default: m.Characters }));
export const loadAlerts = () =>
  import('@/routes/Alerts').then((m): RouteModule => ({ default: m.Alerts }));
export const loadSkills = () =>
  import('@/routes/Skills').then((m): RouteModule => ({ default: m.Skills }));
export const loadSkillPlans = () =>
  import('@/routes/SkillPlans').then((m): RouteModule => ({ default: m.SkillPlans }));
export const loadSkillPlanEditor = () =>
  import('@/routes/SkillPlanEditor').then((m): RouteModule => ({ default: m.SkillPlanEditor }));
export const loadSkillCompare = () =>
  import('@/routes/SkillCompare').then((m): RouteModule => ({ default: m.SkillCompare }));
export const loadSkillShips = () =>
  import('@/routes/SkillShips').then((m): RouteModule => ({ default: m.SkillShips }));
export const loadIndustry = () =>
  import('@/routes/Industry').then((m): RouteModule => ({ default: m.Industry }));
export const loadIndustryPlanPage = () =>
  import('@/routes/IndustryPlanPage').then((m): RouteModule => ({ default: m.IndustryPlanPage }));
export const loadIndustryGroupPage = () =>
  import('@/routes/IndustryGroupPage').then((m): RouteModule => ({ default: m.IndustryGroupPage }));
export const loadCorp = () =>
  import('@/routes/Corp').then((m): RouteModule => ({ default: m.Corp }));
export const loadCorpMembers = () =>
  import('@/routes/CorpMembers').then((m): RouteModule => ({ default: m.CorpMembers }));
export const loadCorpAssets = () =>
  import('@/routes/CorpAssets').then((m): RouteModule => ({ default: m.CorpAssets }));
export const loadMarket = () =>
  import('@/routes/Market').then((m): RouteModule => ({ default: m.Market }));
export const loadWallet = () =>
  import('@/routes/Wallet').then((m): RouteModule => ({ default: m.Wallet }));
export const loadMoonMiningTax = () =>
  import('@/routes/MoonMiningTax').then((m): RouteModule => ({ default: m.MoonMiningTax }));
export const loadLoyaltyStore = () =>
  import('@/routes/LoyaltyStore').then((m): RouteModule => ({ default: m.LoyaltyStore }));
export const loadClones = () =>
  import('@/routes/Clones').then((m): RouteModule => ({ default: m.Clones }));
export const loadPlanetaryIndustry = () =>
  import('@/routes/PlanetaryIndustry').then((m): RouteModule => ({ default: m.PlanetaryIndustry }));
export const loadAssets = () =>
  import('@/routes/Assets').then((m): RouteModule => ({ default: m.Assets }));
export const loadMail = () =>
  import('@/routes/Mail').then((m): RouteModule => ({ default: m.Mail }));
export const loadCalendar = () =>
  import('@/routes/Calendar').then((m): RouteModule => ({ default: m.Calendar }));
export const loadContracts = () =>
  import('@/routes/Contracts').then((m): RouteModule => ({ default: m.Contracts }));
export const loadContacts = () =>
  import('@/routes/Contacts').then((m): RouteModule => ({ default: m.Contacts }));
export const loadEmploymentHistory = () =>
  import('@/routes/EmploymentHistory').then((m): RouteModule => ({ default: m.EmploymentHistory }));
export const loadSettings = () =>
  import('@/routes/Settings').then((m): RouteModule => ({ default: m.Settings }));
export const loadStyleguide = () =>
  import('@/routes/Styleguide').then((m): RouteModule => ({ default: m.Styleguide }));
export const loadAppraisalShared = () =>
  import('@/routes/AppraisalShared').then((m): RouteModule => ({ default: m.AppraisalShared }));
export const loadErrorProbe = () =>
  import('@/routes/ErrorProbe').then((m): RouteModule => ({ default: m.ErrorProbe }));

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
