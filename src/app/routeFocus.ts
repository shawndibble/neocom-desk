/**
 * Moves keyboard focus to the new page's `<h1>` after in-app navigation, so a
 * screen reader announces that the page changed instead of leaving focus on
 * the old rail link (WCAG 4.1.3). Only a real page change counts: a tab
 * switch, an Assets drill-down (`/assets/<location>`) or a plan-to-plan jump
 * keeps the page and must not yank focus away from what the pilot is using.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { pagePathFor } from './pagePathFor';
import { pageKeyFor, tabbedPageFor } from './pageTabs';
import type { AppRoutePath } from './routeScopes';

/**
 * Routes that are separate paths but one page to the pilot: each set shares a
 * sub-nav (`SkillsSubNav`, `CorpSubNav`, `OverviewSubNav`) that stays on
 * screen across the switch, so it behaves like a tab bar — the link just used
 * is still there to keep focus on.
 */
const SUB_NAV_PAGES: Partial<Record<AppRoutePath, AppRoutePath>> = {
  '/skills/trained': '/skills',
  '/skills/plans': '/skills',
  '/skills/compare': '/skills',
  '/skills/certificates': '/skills',
  '/corp/members': '/corp',
  '/corp/wallet': '/corp',
  '/corp/assets': '/corp',
  '/clones': '/overview',
  '/employment-history': '/overview',
};

/** How long a page that is still loading gets to render its `<h1>`. */
export const HEADING_WAIT_MS = 2000;

/**
 * Which page `pathname` is, for focus purposes: a tabbed page's base (or a
 * standalone tab's own path, `pageKeyFor`), a sub-nav page's section, or the
 * matched route pattern with any splat dropped — so `/assets` and
 * `/assets/60003760` are one page, `/skills/plans/1` and `/2` are one page
 * apart from the plan list, and opening a Fitting (`/ships/fittings/edit`)
 * is a page change from the library it was opened from.
 */
export function focusKeyFor(pathname: string): string {
  if (tabbedPageFor(pathname) !== null) return pageKeyFor(pathname);
  const pattern = pagePathFor(pathname);
  if (pattern === '/*') return pathname;
  const route = pattern.replace(/\/\*$/, '') as AppRoutePath;
  return SUB_NAV_PAGES[route] ?? route;
}

let publicRouteRendered = false;

/**
 * Call from a public page that can lead into the shell (NotFound, a Share
 * Link): the shell mounting after it is a navigation, not the document's
 * first load, so route focus must move to its `<h1>`. Not set by redirecting
 * routes like Root — a cold load of `/` still lands on `/overview` untouched.
 */
export function useMarkPublicRouteRendered(): void {
  useEffect(() => {
    publicRouteRendered = true;
  }, []);
}

/** Test seam: forget that a public route rendered. */
export function resetPublicRouteRendered(): void {
  publicRouteRendered = false;
}

/** Whether this mount follows an earlier entry of the same document. */
function enteredByNavigation(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return publicRouteRendered || (typeof idx === 'number' && idx > 0);
}

function focusWithoutScroll(element: HTMLElement): void {
  element.focus({ preventScroll: true });
}

/** Focuses `container`'s `<h1>`, making it focusable first if a route hand-rolled it. */
function focusHeading(container: HTMLElement): boolean {
  const heading = container.querySelector('h1');
  if (heading === null) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  focusWithoutScroll(heading);
  return true;
}

/**
 * First load does nothing — the browser already starts at the top of a fresh
 * document — and neither does a URL with a hash, whose target owns scroll and
 * focus (an old `/settings/general#shortcuts` link, say). `preventScroll` everywhere, so
 * Back and Forward keep whatever scroll the page restores. A page whose `<h1>`
 * waits on data gets `HEADING_WAIT_MS` to render it; the container itself
 * takes focus if none ever appears. Either way, a pilot who already clicked
 * or tabbed somewhere else in the meantime keeps their focus.
 */
export function useRouteFocus(
  containerRef: RefObject<HTMLElement | null>,
  pathname: string,
  hash: string
): void {
  const focusKey = focusKeyFor(pathname);
  // A ref seeded with the first key, not a "first render" flag: StrictMode's
  // double effect would clear a flag and then focus on initial load.
  // Seeded `null` when the shell was entered by navigation (from NotFound, a
  // Share Link), so the first effect focuses the heading.
  const previousKey = useRef<string | null>(enteredByNavigation() ? null : focusKey);

  useEffect(() => {
    if (previousKey.current === focusKey) return;
    previousKey.current = focusKey;
    const container = containerRef.current;
    if (container === null || hash !== '') return;
    if (focusHeading(container)) return;

    const origin = document.activeElement;
    const untouched = () =>
      document.activeElement === origin || document.activeElement === document.body;
    const observer = new MutationObserver(() => {
      if (!untouched() || focusHeading(container)) stop();
    });
    const timer = window.setTimeout(() => {
      stop();
      if (untouched()) focusWithoutScroll(container);
    }, HEADING_WAIT_MS);
    function stop() {
      observer.disconnect();
      window.clearTimeout(timer);
    }
    observer.observe(container, { childList: true, subtree: true });
    return stop;
  }, [containerRef, focusKey, hash]);
}
