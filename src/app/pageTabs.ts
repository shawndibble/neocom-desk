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
  isWithinPage,
  tabFromPathname,
  tabPath,
  type PageTabs,
} from '@/lib/pageTabs';
import { matchPath } from 'react-router-dom';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from './routeScopes';

export const CONTACTS_TABS = definePageTabs('/contacts', [
  { id: 'character', labelKey: 'contacts.tabThisCharacter' },
  { id: 'across', labelKey: 'contacts.tabAcrossCharacters' },
]);

/**
 * Search has its own Items/Courier sub-tab, so each leaf's id is the full
 * path suffix below `/contracts` rather than one segment (see `lib/pageTabs.ts`).
 * `/contracts/search` alone names no tab and redirects like any unknown
 * segment, landing on Items.
 */
export const CONTRACTS_TABS = definePageTabs(
  '/contracts',
  [
    { id: 'search/items', labelKey: 'contractSearch.mode.items' },
    { id: 'search/courier', labelKey: 'contractSearch.mode.courier' },
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
]);

export const PAGE_TABS: Partial<Record<AppRoutePath, PageTabs>> = {
  '/contacts': CONTACTS_TABS,
  '/contracts': CONTRACTS_TABS,
  '/industry': INDUSTRY_TABS,
  '/market': MARKET_TABS,
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
 * Anything else passes through.
 */
export function pageKeyFor(pathname: string): string {
  return tabbedPageFor(pathname)?.base ?? pathname;
}

/**
 * A tabbed page's bare path or unknown segment — a URL `TabRoute` is about to
 * replace with the default tab. Not a page view of its own: analytics skips
 * it and records the tab path that follows.
 */
export function isTabRedirectPath(pathname: string): boolean {
  const page = tabbedPageFor(pathname);
  return page !== null && tabFromPathname(page, pathname) === null;
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
