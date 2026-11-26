export function basenameOf(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '') || '/';
}

export const ROUTER_BASENAME = basenameOf(import.meta.env.BASE_URL);

export function routerPathname(pathname: string, baseUrl: string): string {
  const base = basenameOf(baseUrl);
  const underBase = base !== '/' && (pathname === base || pathname.startsWith(`${base}/`));
  return underBase ? pathname.slice(base.length) || '/' : pathname;
}

export function routerPathOf(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  baseUrl: string
): string {
  return `${routerPathname(location.pathname, baseUrl)}${location.search}${location.hash}`;
}

export function currentRouterPathname(): string {
  return routerPathname(window.location.pathname, import.meta.env.BASE_URL);
}

export function currentRouterPath(): string {
  return routerPathOf(window.location, import.meta.env.BASE_URL);
}

const PUBLIC_ROUTES = [
  '/s',
  '/share',
  '/survey',
  '/apply',
  '/communities/join',
  '/corp-tax-book/verify',
  '/corp-tax-book/remove-now',
] as const;

export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some((route) => isOnRoute(path, route));
}

export function isOnRoute(path: string, route: string): boolean {
  if (!path.startsWith(route)) return false;
  const next = path.charAt(route.length);
  return next === '' || '/?#'.includes(next);
}
