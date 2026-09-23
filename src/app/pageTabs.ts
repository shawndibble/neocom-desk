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

export const PAGE_TABS: Partial<Record<AppRoutePath, PageTabs>> = {
  '/contacts': CONTACTS_TABS,
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
 * `pathname` with a declared tab segment collapsed to its page — the identity
 * of "which page is this" once tabs are paths. Anything else passes through.
 */
export function pageKeyFor(pathname: string): string {
  const page = tabbedPageFor(pathname);
  return page !== null && tabFromPathname(page, pathname) !== null ? page.base : pathname;
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
