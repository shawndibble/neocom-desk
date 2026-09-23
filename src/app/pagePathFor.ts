/**
 * Collapses a pathname to its matched route pattern (e.g.
 * `/skills/plans/:planId`), not the raw path, so a plan ID or corporation ID
 * never becomes a GA4 page path. A tabbed page's tabs are a closed, declared
 * set, so each is reported as its own path (`/contacts/across`).
 *
 * A literal or param route is checked *first*, ahead of `pageTabs.ts`'s own
 * tab collapse — see `isPendingTabRedirect` below for why.
 */
import { matchPath } from 'react-router-dom';
import { ROUTE_REQUIREMENTS } from './routeScopes';
import { isTabRedirectPath, pageKeyFor, tabbedPagePathFor } from './pageTabs';

const STATIC_ROUTE_PATTERNS = ['/', '/login', '/callback', '/styleguide', '/error'] as const;
const KNOWN_ROUTE_PATTERNS = [...STATIC_ROUTE_PATTERNS, ...Object.keys(ROUTE_REQUIREMENTS)];

function matchedKnownRoute(pathname: string): string | undefined {
  return KNOWN_ROUTE_PATTERNS.find((candidate) => matchPath(candidate, pathname));
}

export function pagePathFor(pathname: string): string {
  const pattern = matchedKnownRoute(pathname);
  if (pattern !== undefined) return pattern;
  return tabbedPagePathFor(pathname) ?? '/*';
}

/**
 * Whether `pathname` is a tabbed page's bare path or unknown segment that
 * `TabRoute` is about to replace with the default tab — the check
 * `AnalyticsPageViewTracker` skips a page view for, so the redirect's target
 * is counted once rather than the redirect and the target both.
 *
 * `pageTabs.ts`'s own `isTabRedirectPath` has no knowledge of the route
 * table, so a sibling route nested under a tabbed page's base
 * (`/wallet/loyalty/:corporationId` under `/wallet`) reads to it exactly
 * like an unknown tab segment. The real route table breaks the tie: when a
 * known pattern matches `pathname`, it's a pending redirect only if that
 * pattern *is* the tabbed page's own base (a bare `/wallet` also matches the
 * literal `/wallet` entry) — a pattern naming anything else is a real,
 * directly rendered page, not a redirect.
 */
export function isPendingTabRedirect(pathname: string): boolean {
  if (!isTabRedirectPath(pathname)) return false;
  const matched = matchedKnownRoute(pathname);
  return matched === undefined || matched === tabbedPagePathFor(pathname);
}

/**
 * `pageTabs.ts`'s `pageKeyFor`, tie-broken the same way `isPendingTabRedirect`
 * is: a known route more specific than the tabbed page's own base (that same
 * `/wallet/loyalty/:corporationId` sibling) is a different page, not a
 * collapsed tab of it. `Layout.tsx`'s route fade keys on this rather than on
 * `pageKeyFor` directly, so switching from a Wallet tab into Loyalty Store
 * still fades — a real page change, not a tab switch.
 */
export function resolvedPageKeyFor(pathname: string): string {
  const matched = matchedKnownRoute(pathname);
  if (matched !== undefined && matched !== tabbedPagePathFor(pathname)) return matched;
  return pageKeyFor(pathname);
}
