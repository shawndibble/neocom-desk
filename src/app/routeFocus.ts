import { useEffect, useRef, type RefObject } from 'react';
import { pagePathFor } from './pagePathFor';
import { pageKeyFor, tabbedPageFor } from './pageTabs';
import type { AppRoutePath } from './routeScopes';

const SUB_NAV_PAGES: Partial<Record<AppRoutePath, AppRoutePath>> = {
  '/skills/trained': '/skills',
  '/skills/plans': '/skills',
  '/skills/certificates': '/skills',
  '/clones': '/overview',
  '/employment-history': '/overview',
  '/srp': '/overview',
};

export const HEADING_WAIT_MS = 2000;

export function focusKeyFor(pathname: string): string {
  if (tabbedPageFor(pathname) !== null) {
    const key = pageKeyFor(pathname);
    return SUB_NAV_PAGES[key as AppRoutePath] ?? key;
  }
  const pattern = pagePathFor(pathname);
  if (pattern === '/*') return pathname;
  const route = pattern.replace(/\/\*$/, '') as AppRoutePath;
  return SUB_NAV_PAGES[route] ?? route;
}

let publicRouteRendered = false;

export function useMarkPublicRouteRendered(): void {
  useEffect(() => {
    publicRouteRendered = true;
  }, []);
}

export function resetPublicRouteRendered(): void {
  publicRouteRendered = false;
}

function enteredByNavigation(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return publicRouteRendered || (typeof idx === 'number' && idx > 0);
}

function focusWithoutScroll(element: HTMLElement): void {
  element.focus({ preventScroll: true });
}

function focusHeading(container: HTMLElement): boolean {
  const heading = container.querySelector('h1');
  if (heading === null) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  focusWithoutScroll(heading);
  return true;
}

export function useRouteFocus(
  containerRef: RefObject<HTMLElement | null>,
  pathname: string,
  hash: string
): void {
  const focusKey = focusKeyFor(pathname);
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
