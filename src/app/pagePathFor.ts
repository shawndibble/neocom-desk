/**
 * Collapses a pathname to its matched route pattern (e.g.
 * `/skills/plans/:planId`), not the raw path, so a plan ID or corporation ID
 * never becomes a GA4 page path. A tabbed page's tabs are a closed, declared
 * set, so each is reported as its own path (`/contacts/across`).
 */
import { matchPath } from 'react-router-dom';
import { ROUTE_REQUIREMENTS } from './routeScopes';
import { tabbedPagePathFor } from './pageTabs';

const STATIC_ROUTE_PATTERNS = ['/', '/login', '/callback', '/styleguide', '/error'] as const;
const KNOWN_ROUTE_PATTERNS = [...STATIC_ROUTE_PATTERNS, ...Object.keys(ROUTE_REQUIREMENTS)];

export function pagePathFor(pathname: string): string {
  const tabbed = tabbedPagePathFor(pathname);
  if (tabbed !== null) return tabbed;
  const pattern = KNOWN_ROUTE_PATTERNS.find((candidate) => matchPath(candidate, pathname));
  return pattern ?? '/*';
}
