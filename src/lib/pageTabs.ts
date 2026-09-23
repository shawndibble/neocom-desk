/**
 * A tabbed page's tabs, declared once: id (= its path segment) and the label
 * key the `Tabs` bar prints. The id doubles as the URL segment, so
 * `/contacts/across` is the Across Characters tab and there is no second
 * table mapping one to the other (ADR 0015).
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
}

/** `defaultTab` defaults to the first tab — the one the bar shows leftmost. */
export function definePageTabs<const Id extends string>(
  base: string,
  tabs: readonly [PageTab<Id>, ...PageTab<Id>[]],
  defaultTab: Id = tabs[0].id
): PageTabs<Id> {
  return { base, tabs, defaultTab };
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
