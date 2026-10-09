/**
 * Every tabbed page, keyed by its route path (ADR 0015). Registering a page
 * here is the whole of its routing change: `App.tsx` mounts it at
 * `<path>/*`, `TabRoute` sends the bare path (or an unknown segment) to its
 * default tab, `pagePathFor` reports each tab to analytics, and `Layout`'s
 * route fade treats a tab switch as the same page. `ROUTE_ELEMENTS`,
 * `ROUTE_REQUIREMENTS` and `routeWarm` keep their single entry for the page —
 * a tab never adds one (docs/ARCHITECTURE.md §9).
 */
import {
  definePageTabs,
  isIndexPath,
  isWithinPage,
  tabFromPathname,
  tabPath,
  type PageTabs,
} from '@/lib/pageTabs';
import { matchPath } from 'react-router-dom';
import { legacyAssetsLocation } from '@/engine/assetPath';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import { SHIPS_TABS } from '@/features/fittings/shipsTabs';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from './routeScopes';

export const CONTACTS_TABS = definePageTabs('/contacts', [
  { id: 'character', labelKey: 'contacts.tabThisCharacter' },
  { id: 'across', labelKey: 'contacts.tabAcrossCharacters' },
  { id: 'standings', labelKey: 'contacts.tabStandings' },
]);

/** Travel (issue #2328), with Thera/Turnur (#2330). Pilot Lookup is its own page now. */
export const TRAVEL_TABS = definePageTabs('/travel', [
  { id: 'route', labelKey: 'travel.routeTab' },
  { id: 'thera', labelKey: 'travel.thera.tab' },
]);

/**
 * Settings has no tab bar: each entry is a section in the page's own left rail
 * (`features/settings/sections.ts` groups them and decides which the rail
 * shows). It is still registered here because a section is a path
 * (`/settings/industry`), which is what deep links, Back and analytics want.
 * `notifications`, `dataAge`, `activity` and `faq` keep the ids they had as
 * tabs so existing links land where they always did.
 */
export const SETTINGS_TABS = definePageTabs(
  '/settings',
  [
    { id: 'display', labelKey: 'settings.tabs.display' },
    { id: 'permissions', labelKey: 'settings.tabs.permissions' },
    { id: 'industry', labelKey: 'settings.tabs.industry' },
    { id: 'market', labelKey: 'settings.tabs.market' },
    { id: 'miningTax', labelKey: 'settings.tabs.miningTax' },
    { id: 'characters', labelKey: 'settings.tabs.characters' },
    { id: 'corporation', labelKey: 'settings.tabs.corporation' },
    { id: 'travel', labelKey: 'settings.tabs.travel' },
    { id: 'notifications', labelKey: 'settings.tabs.notifications' },
    { id: 'dataAge', labelKey: 'settings.tabs.data' },
    { id: 'activity', labelKey: 'settings.tabs.activity' },
  ],
  undefined,
  // A phone lists the sections at `/settings`; `md` up has the rail and lands on Display.
  { hiddenFrom: '(min-width: 48rem)' }
);

/**
 * Help & FAQ, moved out of Settings (`/settings/shortcuts`, `/settings/faq` and
 * `/settings/help` redirect here). Shortcuts first: the tab `/help` opens on.
 */
export const HELP_TABS = definePageTabs('/help', [
  { id: 'shortcuts', labelKey: 'settings.help.tabShortcuts' },
  { id: 'faq', labelKey: 'settings.help.tabFaq' },
  { id: 'support', labelKey: 'settings.help.tabSupport' },
]);

export const PI_TABS = definePageTabs('/planetary-industry', [
  { id: 'plan', labelKey: 'piPlan.planTab' },
  { id: 'map', labelKey: 'piPlan.mapTab' },
  { id: 'colonies', labelKey: 'piPlan.coloniesTab' },
]);

export const MINING_TABS = definePageTabs('/mining', [
  { id: 'overview', labelKey: 'miningTax.overviewTab' },
  { id: 'tax', labelKey: 'miningTax.taxTab' },
  { id: 'survey', labelKey: 'miningTax.surveyTab' },
]);

/**
 * `transactions` is not a tab Wallet shows: the Character's fills live on
 * Market's History › Transactions view, and the corporation's on
 * `/corp/wallet`. The entry exists only so an old `/wallet/transactions` link
 * reaches `Wallet.tsx`, which sends it on to Market, instead of `TabRoute`
 * bouncing it to Balance.
 */
export const WALLET_TABS = definePageTabs('/wallet', [
  { id: 'balance', labelKey: 'wallet.balanceTab' },
  { id: 'journal', labelKey: 'wallet.journalTab' },
  { id: 'transactions', labelKey: 'market.sections.transactions' },
]);

/**
 * Item search and Courier keep their `search/…` ids from when they were one
 * Search tab's sub-modes, so links copied then still open; each id is the full
 * path suffix below `/contracts` rather than one segment (see `lib/pageTabs.ts`).
 * `/contracts/search` alone names no tab and redirects like any unknown
 * segment, landing on Item search.
 */
export const CONTRACTS_TABS = definePageTabs(
  '/contracts',
  [
    { id: 'search/items', labelKey: 'contracts.itemSearchTab' },
    { id: 'search/courier', labelKey: 'contracts.courierTab' },
    { id: 'history', labelKey: 'contracts.historyTab' },
  ],
  'search/items'
);

/**
 * `history/transactions` is a tab id containing a literal `/`, not a nested
 * subtab of `history` — `tabFromPathname` only ever compares one segment
 * against a tab's `id` for equality, so a `/`-bearing id is how a two-segment
 * path (`/market/history/transactions`) resolves without either this
 * registry or `usePageTab` needing to understand subtabs at all (the same
 * technique `CONTRACTS_TABS` above uses for its own search sub-tab). It is
 * not one of the four tabs the `Tabs` bar renders — `HistoryViewSelect`,
 * inside History's own header, is what switches into and out of it (round
 * 54); this entry exists only so that path resolves to a real tab instead of
 * bouncing to the default (docs/ARCHITECTURE.md §9).
 */
export const MARKET_TABS = definePageTabs('/market', [
  { id: 'browser', labelKey: 'market.sections.browser' },
  { id: 'orders', labelKey: 'market.sections.openOrders' },
  { id: 'history', labelKey: 'market.sections.history' },
  { id: 'history/transactions', labelKey: 'market.sections.transactions' },
  { id: 'appraisal', labelKey: 'market.sections.appraisal' },
  { id: 'hauling', labelKey: 'market.sections.hauling' },
  // Its own route (`/market/lp-store[/:corporationId]`) outranks Market's, so
  // `LoyaltyStore` draws the tab bar itself; the entry is what makes the path a Market tab.
  { id: 'lp-store', labelKey: 'loyaltyStore.title' },
]);

/**
 * Assets' Items tab owns the drill-down below it (`/assets/items/<location>/...`,
 * `PageTab.deep`), so Ships and Move sit beside it. Old links
 * (`/assets/<location>/...`, `/assets?view=ships`) move via
 * `PAGE_LEGACY_LOCATIONS`.
 */
export const ASSETS_TABS = definePageTabs('/assets', [
  { id: 'items', labelKey: 'assets.tabs.items', deep: true },
  { id: 'ships', labelKey: 'assets.tabs.ships' },
  { id: 'move', labelKey: 'assets.tabs.move' },
]);

export const PAGE_TABS: Partial<Record<AppRoutePath, PageTabs>> = {
  '/assets': ASSETS_TABS,
  '/contacts': CONTACTS_TABS,
  '/contracts': CONTRACTS_TABS,
  '/industry': INDUSTRY_TABS,
  '/ships': SHIPS_TABS,
  '/settings': SETTINGS_TABS,
  '/help': HELP_TABS,
  '/market': MARKET_TABS,
  '/planetary-industry': PI_TABS,
  '/mining': MINING_TABS,
  '/wallet': WALLET_TABS,
  '/travel': TRAVEL_TABS,
};

/**
 * A tabbed page's pre-tabs URLs: asked first, by `TabRoute`, about a path that
 * names no tab; an answer replaces the default-tab redirect.
 */
export const PAGE_LEGACY_LOCATIONS: Partial<
  Record<
    AppRoutePath,
    (pathname: string, search: string) => { pathname: string; search: string } | null
  >
> = {
  '/assets': legacyAssetsLocation,
};

const TABBED_PAGES = Object.values(PAGE_TABS);

/**
 * Routes nested under a tabbed page's base (`/industry/plans/:planId`): React
 * Router ranks them above the page's `<base>/*` splat, so a path they match
 * is their page, not the tabbed one.
 */
const NESTED_ROUTE_PATTERNS = (Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[]).filter((path) =>
  TABBED_PAGES.some((page) => path.startsWith(`${page.base}/`))
);

/** The tabbed page `pathname` sits in, if any. */
export function tabbedPageFor(pathname: string): PageTabs | null {
  if (NESTED_ROUTE_PATTERNS.some((pattern) => matchPath(pattern, pathname))) return null;
  return TABBED_PAGES.find((page) => isWithinPage(page, pathname)) ?? null;
}

/** The pattern `App.tsx` mounts a route at: a tabbed page takes its tab segment as a splat. */
export function routePatternFor(path: AppRoutePath): string {
  return PAGE_TABS[path] ? `${path}/*` : path;
}

/**
 * `pathname` collapsed to its tabbed page, if in one — the identity of
 * "which page is this" once tabs are paths. Includes the bare path and an
 * unknown segment, so the redirect to the default tab does not fade twice.
 * A `standalone` tab keeps its own path. Anything else passes through.
 */
export function pageKeyFor(pathname: string): string {
  const page = tabbedPageFor(pathname);
  if (page === null) return pathname;
  const id = tabFromPathname(page, pathname);
  const tab = page.tabs.find((candidate) => candidate.id === id);
  // A standalone tab is a page of its own, only mounted with this one.
  return tab?.standalone ? tabPath(page, tab.id) : page.base;
}

/**
 * A tabbed page's bare path or unknown segment — a URL `TabRoute` is about to
 * replace with the default tab. Not a page view of its own: analytics skips
 * it and records the tab path that follows.
 */
export function isTabRedirectPath(pathname: string): boolean {
  const page = tabbedPageFor(pathname);
  return page !== null && tabFromPathname(page, pathname) === null && !isIndexPath(page, pathname);
}

/**
 * A tabbed page's path as analytics should record it: the declared tab path,
 * or the page itself for anything that is about to redirect. `null` for a
 * pathname in no tabbed page.
 */
export function tabbedPagePathFor(pathname: string): string | null {
  const page = tabbedPageFor(pathname);
  if (page === null) return null;
  const tab = tabFromPathname(page, pathname);
  return tab === null ? page.base : tabPath(page, tab);
}
