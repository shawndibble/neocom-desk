/**
 * Pure helpers behind the rail's open section, the pilot's hidden pages and
 * the Recent row (scope decision
 * `20261002-145653-rail-opens-the-current-page-icons-hiding-and`). Plain data,
 * like `navDestinations.ts`: no React, no Dexie — the stores that hold the
 * hidden and recent lists live in `navPreferences.ts`.
 */
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
}

/**
 * Every page and view path, in nav order: each page, then its tabs, then its
 * sub-views — `navTabs`' tabs, so the rail owns exactly what it lists.
 */
const OWNED_PATHS: readonly OwnedPath[] = (NAV_PAGES as readonly NavPage[]).flatMap((page) => {
  const pagePath = page.path as NavPagePath;
  const tabPaths = navTabs(page).map((tab) => tab.path);
  const viewPaths = (page.subViews ?? []).map((view) => view.path as string);
  return [page.path, ...tabPaths, ...viewPaths].map((path) => ({ path, pagePath }));
});

const NAV_ORDER = new Map(OWNED_PATHS.map((owned, index) => [owned.path, index]));

function within(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The deepest nav entry a pathname falls under, or undefined off the nav. */
function deepestOwner(pathname: string): OwnedPath | undefined {
  let best: OwnedPath | undefined;
  for (const owned of OWNED_PATHS) {
    if (within(pathname, owned.path) && (!best || owned.path.length > best.path.length)) {
      best = owned;
    }
  }
  return best;
}

/**
 * The page whose section the rail opens for `pathname`. A sub-view belongs to
 * its page even where its path does not nest under it (`/clones` → Overview),
 * and a detail route belongs to the page above it.
 */
export function currentPagePath(pathname: string): NavPagePath | null {
  return deepestOwner(pathname)?.pagePath ?? null;
}

/** The page, tab or sub-view `pathname` shows — what the Recent row records. */
export function viewPathFor(pathname: string): string | null {
  return deepestOwner(pathname)?.path ?? null;
}

/** Both of the above from one scan, for a caller that needs the two. */
export function navPlaceFor(pathname: string): {
  pagePath: NavPagePath | null;
  viewPath: string | null;
} {
  const owner = deepestOwner(pathname);
  return { pagePath: owner?.pagePath ?? null, viewPath: owner?.path ?? null };
}

/**
 * The footer's own links (Help, then Settings), in descriptor order, for the
 * rail's foot and the More sheet's. Characters is a footer page too, but both
 * surfaces give it its own portrait link.
 */
export const FOOTER_PAGES: readonly NavPage[] = (NAV_PAGES as readonly NavPage[]).filter(
  (page) => page.group === 'footer' && page.path !== '/characters'
);

/**
 * Pages that are the only way to something never hide, read off the
 * descriptor rather than listed: Corp (already hidden unless the Character
 * has corp access) and every footer page — Settings has no other route on a
 * phone, Characters is the only way to switch, and Help is where a lost pilot
 * goes.
 */
const NEVER_HIDDEN: ReadonlySet<string> = new Set(
  (NAV_PAGES as readonly NavPage[])
    .filter((page) => page.group === 'footer' || page.gating === 'corp')
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

/**
 * The pilot's hidden pages and views, once each, in nav order. A path this
 * build does not know is kept (last), not dropped: it was synced from a newer
 * build, and dropping it here would un-hide it there the next time this device
 * writes — the rule `features/overview/hiddenCards.ts` follows for cards. A
 * path that must never hide is dropped.
 */
export function parseHiddenNav(raw: unknown): string[] | null {
  const kept = knownPaths(raw, (path) => !NEVER_HIDDEN.has(path));
  const order = (path: string) => NAV_ORDER.get(path) ?? Number.MAX_SAFE_INTEGER;
  return kept && kept.sort((a, b) => order(a) - order(b));
}

/** What a new pilot sees on the rail (scope decision `20261009-163837-pinned-rail-...`). */
export const DEFAULT_SHOWN_NAV: readonly string[] = [
  '/overview',
  '/skills',
  '/industry',
  '/ships',
  '/market',
  '/assets',
  '/wallet',
  '/travel',
];

/** The first-run question's answers, each with the pages it brings onto the rail. */
export const NAV_ACTIVITIES = [
  { id: 'mining', paths: ['/mining'] },
  { id: 'pi', paths: ['/planetary-industry'] },
  { id: 'trading', paths: ['/contracts'] },
  { id: 'industry', paths: [] },
  { id: 'social', paths: ['/mail', '/calendar', '/contacts'] },
  { id: 'intel', paths: ['/alerts', '/pilot-lookup'] },
] as const satisfies readonly { id: string; paths: readonly string[] }[];

function hiddenExcept(shown: ReadonlySet<string>): string[] {
  return (NAV_PAGES as readonly NavPage[])
    .map((page) => page.path as string)
    .filter((path) => canHide(path) && !shown.has(path));
}

/** The hidden list of a pilot who has not chosen anything: every page outside the default set. */
export function defaultHiddenNav(): string[] {
  return hiddenExcept(new Set(DEFAULT_SHOWN_NAV));
}

/** The starting hidden list for the activities a pilot picked: the default set plus their pages. */
export function hiddenNavForActivities(activities: readonly string[]): string[] {
  const shown = new Set(DEFAULT_SHOWN_NAV);
  for (const activity of NAV_ACTIVITIES) {
    if (activities.includes(activity.id)) for (const path of activity.paths) shown.add(path);
  }
  return hiddenExcept(shown);
}

/** How many recent views are kept: one more than are shown, so the current one can be skipped. */
const RECENT_KEPT = 4;
const RECENT_SHOWN = 3;

/** Records a visit: newest first, never twice, `RECENT_KEPT` at most. */
export function pushRecentNav(recent: readonly string[], path: string): string[] {
  return [path, ...recent.filter((entry) => entry !== path)].slice(0, RECENT_KEPT);
}

/** The Recent row: the newest views other than the one on screen. */
export function recentNavFor(recent: readonly string[], currentViewPath: string | null): string[] {
  return recent.filter((path) => path !== currentViewPath).slice(0, RECENT_SHOWN);
}

/** Stored recent views, minus any this build no longer has. */
export function parseRecentNav(raw: unknown): string[] | null {
  const kept = knownPaths(raw, (path) => NAV_ORDER.has(path));
  return kept && kept.slice(0, RECENT_KEPT);
}

/** Each page's views (its tabs and sub-views), keyed by the page. */
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
