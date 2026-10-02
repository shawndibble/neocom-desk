/**
 * Pure helpers behind the rail's open section, the pilot's hidden pages and
 * the Recent row (scope decision
 * `20261002-145653-rail-opens-the-current-page-icons-hiding-and`). Plain data,
 * like `navDestinations.ts`: no React, no Dexie — the stores that hold the
 * hidden and recent lists live in `navPreferences.ts`.
 */
import { tabBarTabs, tabPath } from '@/lib/pageTabs';
import { NAV_PAGES, type NavDestination, type NavPage, type NavPagePath } from './navDestinations';
import { PAGE_TABS } from './pageTabs';

interface OwnedPath {
  readonly path: string;
  readonly pagePath: NavPagePath;
}

/**
 * Every page and view path, in nav order: each page, then its tabs, then its
 * sub-views. Alias tabs are left out — they only redirect.
 */
const OWNED_PATHS: readonly OwnedPath[] = (NAV_PAGES as readonly NavPage[]).flatMap((page) => {
  const pagePath = page.path as NavPagePath;
  const tabs = PAGE_TABS[page.path];
  const tabPaths = tabs
    ? tabBarTabs(tabs)
        .filter((tab) => !page.aliasTabs?.includes(tab.id))
        .map((tab) => tabPath(tabs, tab.id))
    : [];
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

/**
 * Pages that are the only way to something never hide: Corp is already hidden
 * unless the Character has corp access, Settings has no other route on a
 * phone, Characters is the only way to switch, and Help is where a lost pilot
 * goes.
 */
const NEVER_HIDDEN: ReadonlySet<string> = new Set(['/corp', '/settings', '/characters', '/help']);

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
