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
import type { AppRoutePath } from './routeScopes';

export const CONTACTS_TABS = definePageTabs('/contacts', [
  { id: 'character', labelKey: 'contacts.tabThisCharacter' },
  { id: 'across', labelKey: 'contacts.tabAcrossCharacters' },
]);

export const PI_TABS = definePageTabs('/planetary-industry', [
  { id: 'colonies', labelKey: 'piPlan.coloniesTab' },
  { id: 'plan', labelKey: 'piPlan.planTab' },
  { id: 'advisor', labelKey: 'piPlan.advisorTab' },
]);

export const MINING_TABS = definePageTabs('/mining', [
  { id: 'tax', labelKey: 'miningTax.taxTab' },
  { id: 'overview', labelKey: 'miningTax.overviewTab' },
]);

export const PAGE_TABS: Partial<Record<AppRoutePath, PageTabs>> = {
  '/contacts': CONTACTS_TABS,
  '/planetary-industry': PI_TABS,
  '/mining': MINING_TABS,
};

const TABBED_PAGES = Object.values(PAGE_TABS);

/** The tabbed page `pathname` sits in, if any. */
export function tabbedPageFor(pathname: string): PageTabs | null {
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
