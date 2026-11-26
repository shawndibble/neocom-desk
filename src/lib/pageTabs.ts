export interface PageTab<Id extends string = string> {
  readonly id: Id;
  readonly labelKey: string;
  readonly standalone?: boolean;
  readonly deep?: boolean;
}

export interface PageTabs<Id extends string = string> {
  readonly base: string;
  readonly tabs: readonly PageTab<Id>[];
  readonly defaultTab: Id;
  readonly index?: { readonly hiddenFrom: string };
}

export function definePageTabs<const Id extends string>(
  base: string,
  tabs: readonly [PageTab<Id>, ...PageTab<Id>[]],
  defaultTab: Id = tabs[0].id,
  index?: PageTabs<Id>['index']
): PageTabs<Id> {
  return index ? { base, tabs, defaultTab, index } : { base, tabs, defaultTab };
}

function isBasePath(page: PageTabs, pathname: string): boolean {
  return pathname === page.base || pathname === `${page.base}/`;
}

export function isIndexPath(page: PageTabs, pathname: string): boolean {
  if (!page.index || !isBasePath(page, pathname)) return false;
  return typeof window !== 'undefined' && !window.matchMedia(page.index.hiddenFrom).matches;
}

export function tabBarTabs<Id extends string>(page: PageTabs<Id>): readonly PageTab<Id>[] {
  return page.tabs.filter((tab) => !tab.standalone);
}

export function tabPath<Id extends string>(page: PageTabs<Id>, id: Id): string {
  return `${page.base}/${id}`;
}

export function isWithinPage(page: PageTabs, pathname: string): boolean {
  return pathname === page.base || pathname.startsWith(`${page.base}/`);
}

export function tabFromPathname<Id extends string>(
  page: PageTabs<Id>,
  pathname: string
): Id | null {
  if (!pathname.startsWith(`${page.base}/`)) return null;
  const segment = pathname.slice(page.base.length + 1).replace(/\/$/, '');
  const exact = page.tabs.find((tab) => tab.id === segment);
  if (exact) return exact.id;
  return page.tabs.find((tab) => tab.deep && segment.startsWith(`${tab.id}/`))?.id ?? null;
}

export interface TabRouteDefaultState {
  tabRouteDefaulted?: boolean;
}

export function isTabRouteDefaulted(state: unknown): boolean {
  return Boolean((state as TabRouteDefaultState | null)?.tabRouteDefaulted);
}
