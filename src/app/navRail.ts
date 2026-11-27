import {
  NAV_PAGES,
  navTabs,
  type NavDestination,
  type NavPage,
  type NavPagePath,
} from './navDestinations';

interface OwnedPath {
  readonly path: string;
  readonly pagePath: NavPagePath;
  readonly viewPath: string;
}

const NAV_PATHS: readonly OwnedPath[] = (NAV_PAGES as readonly NavPage[]).flatMap((page) => {
  const pagePath = page.path as NavPagePath;
  const tabPaths = navTabs(page).map((tab) => tab.path);
  const viewPaths = (page.subViews ?? []).map((view) => view.path as string);
  return [page.path, ...tabPaths, ...viewPaths].map((path) => ({ path, pagePath, viewPath: path }));
});

const VIEW_ALIASES: Readonly<Record<string, string>> = { '/industry/groups': '/industry/plans' };

const OWNED_PATHS: readonly OwnedPath[] = [
  ...NAV_PATHS,
  ...Object.entries(VIEW_ALIASES).flatMap(([path, viewPath]) =>
    NAV_PATHS.filter((owned) => owned.path === viewPath).map((owned) => ({ ...owned, path }))
  ),
];

const NAV_ORDER = new Map(NAV_PATHS.map((owned, index) => [owned.path, index]));

function within(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function deepestOwner(pathname: string): OwnedPath | undefined {
  let best: OwnedPath | undefined;
  for (const owned of OWNED_PATHS) {
    if (within(pathname, owned.path) && (!best || owned.path.length > best.path.length)) {
      best = owned;
    }
  }
  return best;
}

export function viewPathFor(pathname: string): string | null {
  return deepestOwner(pathname)?.viewPath ?? null;
}

export function navPlaceFor(pathname: string): {
  pagePath: NavPagePath | null;
  viewPath: string | null;
} {
  const owner = deepestOwner(pathname);
  return { pagePath: owner?.pagePath ?? null, viewPath: owner?.viewPath ?? null };
}

export const FOOTER_PAGES: readonly NavPage[] = (NAV_PAGES as readonly NavPage[]).filter(
  (page) => page.group === 'footer' && page.path !== '/characters'
);

const NEVER_HIDDEN: ReadonlySet<string> = new Set(
  (NAV_PAGES as readonly NavPage[])
    .filter((page) => page.group === 'footer')
    .map((page) => page.path)
);

export function canHide(path: string): boolean {
  return NAV_ORDER.has(path) && !NEVER_HIDDEN.has(path);
}

function knownPaths(raw: unknown, keep: (path: string) => boolean): string[] | null {
  if (!Array.isArray(raw)) return null;
  const kept = raw.filter((value): value is string => typeof value === 'string' && keep(value));
  return [...new Set(kept)];
}

export function parseHiddenNav(raw: unknown): string[] | null {
  const kept = knownPaths(raw, (path) => !NEVER_HIDDEN.has(path));
  const order = (path: string) => NAV_ORDER.get(path) ?? Number.MAX_SAFE_INTEGER;
  return kept && kept.sort((a, b) => order(a) - order(b));
}

const RECENT_KEPT = 4;
const RECENT_SHOWN = 3;

export function pushRecentNav(recent: readonly string[], path: string): string[] {
  return [path, ...recent.filter((entry) => entry !== path)].slice(0, RECENT_KEPT);
}

export function recentNavFor(recent: readonly string[], currentViewPath: string | null): string[] {
  return recent.filter((path) => path !== currentViewPath).slice(0, RECENT_SHOWN);
}

export function parseRecentNav(raw: unknown): string[] | null {
  const kept = knownPaths(raw, (path) => NAV_ORDER.has(path));
  return kept && kept.slice(0, RECENT_KEPT);
}

export function viewsByPage(
  destinations: readonly NavDestination[]
): Map<string, NavDestination[]> {
  const byPage = new Map<string, NavDestination[]>();
  for (const destination of destinations) {
    if (destination.kind !== 'tab') continue;
    const views = byPage.get(destination.pagePath) ?? [];
    views.push(destination);
    byPage.set(destination.pagePath, views);
  }
  return byPage;
}
