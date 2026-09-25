/**
 * A tabbed page's tabs, declared once: id (= everything below the page's
 * base path) and the label key the `Tabs` bar prints. The id doubles as the
 * URL suffix, so `/contacts/across` is the Across Characters tab and there
 * is no second table mapping one to the other (ADR 0015).
 *
 * An id may itself contain a `/` for a page with a sub-tab nested under one
 * of its tabs (e.g. `search/items`, `search/courier`, `history` for
 * Contracts) — `tabFromPathname` matches the whole remainder of the path,
 * not a single segment, so this needs no separate primitive. Such a page
 * renders its own top-level tab bar from a derived, coarser id (e.g. the
 * part before the `/`) rather than feeding `tabs` straight into `Tabs`.
 *
 * Pure. The registry of which pages have tabs is `app/pageTabs.ts`; the
 * React side is `usePageTab` (`./usePageTab.ts`).
 */

export interface PageTab<Id extends string = string> {
  readonly id: Id;
  /** i18next key for the tab's label. */
  readonly labelKey: string;
}

export interface PageTabs<Id extends string = string> {
  /** The page's own route path, e.g. `/contacts`. Tabs live one segment below it. */
  readonly base: string;
  readonly tabs: readonly PageTab<Id>[];
  /** Where the bare base path, or an unknown segment, lands. */
  readonly defaultTab: Id;
  /**
   * Opt-in index state: below `hiddenFrom` (a media query, e.g. `(min-width:
   * 48rem)`), the bare base path renders the page as its own list of tabs
   * instead of redirecting to `defaultTab`. From `hiddenFrom` up it redirects
   * as ever. Absent, the bare path always redirects.
   */
  readonly index?: { readonly hiddenFrom: string };
}

/** `defaultTab` defaults to the first tab — the one the bar shows leftmost. */
export function definePageTabs<const Id extends string>(
  base: string,
  tabs: readonly [PageTab<Id>, ...PageTab<Id>[]],
  defaultTab: Id = tabs[0].id,
  index?: PageTabs<Id>['index']
): PageTabs<Id> {
  return index ? { base, tabs, defaultTab, index } : { base, tabs, defaultTab };
}

/** Whether `pathname` is exactly the page's bare base path (a trailing slash is tolerated). */
function isBasePath(page: PageTabs, pathname: string): boolean {
  return pathname === page.base || pathname === `${page.base}/`;
}

/**
 * Whether the page's index state is showing right now: it declares one, the
 * viewport is below its `hiddenFrom` query, and `pathname` is the bare base.
 * Reads the viewport synchronously, so it is right on the first render.
 */
export function isIndexPath(page: PageTabs, pathname: string): boolean {
  if (!page.index || !isBasePath(page, pathname)) return false;
  return typeof window !== 'undefined' && !window.matchMedia(page.index.hiddenFrom).matches;
}

export function tabPath<Id extends string>(page: PageTabs<Id>, id: Id): string {
  return `${page.base}/${id}`;
}

/** Whether `pathname` is the page itself or anything below it. */
export function isWithinPage(page: PageTabs, pathname: string): boolean {
  return pathname === page.base || pathname.startsWith(`${page.base}/`);
}

/**
 * The tab `pathname` names, or `null` when it names none: the bare base path,
 * an unknown segment, or anything deeper than one segment below the base. A
 * trailing slash is tolerated, as React Router itself tolerates it.
 */
export function tabFromPathname<Id extends string>(
  page: PageTabs<Id>,
  pathname: string
): Id | null {
  if (!pathname.startsWith(`${page.base}/`)) return null;
  const segment = pathname.slice(page.base.length + 1).replace(/\/$/, '');
  return page.tabs.find((tab) => tab.id === segment)?.id ?? null;
}
