/**
 * Router paths versus browser paths. The router is mounted under Vite's
 * `BASE_URL` (`base` in vite.config.ts, `/` today), so a `window.location`
 * has to lose that prefix before it can be compared with a route or handed to
 * `navigate()`.
 *
 * Imports nothing at runtime: `bootShellPreload` runs it ahead of the rest of
 * the entry and must stay light.
 */

/** A `BASE_URL` as React Router's `basename`: no trailing slash, `/` at the root. */
export function basenameOf(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '') || '/';
}

/** `App`'s router `basename`. */
export const ROUTER_BASENAME = basenameOf(import.meta.env.BASE_URL);

/** A browser pathname as a router pathname, the base stripped at a segment boundary. */
export function routerPathname(pathname: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const underBase = base !== '' && (pathname === base || pathname.startsWith(`${base}/`));
  return underBase ? pathname.slice(base.length) || '/' : pathname;
}

/** A browser location as a path the router can navigate to, query and hash kept. */
export function routerPathOf(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  baseUrl: string
): string {
  return `${routerPathname(location.pathname, baseUrl)}${location.search}${location.hash}`;
}

/** The router path of the page this tab is showing. */
export function currentRouterPath(): string {
  return routerPathOf(window.location, import.meta.env.BASE_URL);
}

/** Whether `path` (a router path) is on `route`, e.g. `/callback?code=…` on `/callback`. */
export function isOnRoute(path: string, route: string): boolean {
  if (!path.startsWith(route)) return false;
  const next = path.charAt(route.length);
  return next === '' || '/?#'.includes(next);
}
