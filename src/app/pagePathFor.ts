/**
 * Collapses a pathname to its matched route pattern (e.g.
 * `/skills/plans/:planId`), not the raw path, so a plan ID or corporation ID
 * never becomes a GA4 page path.
 */
import { matchPath } from 'react-router-dom';
import { ROUTE_REQUIREMENTS } from './routeScopes';

const STATIC_ROUTE_PATTERNS = ['/', '/login', '/callback', '/styleguide', '/error'] as const;
const KNOWN_ROUTE_PATTERNS = [...STATIC_ROUTE_PATTERNS, ...Object.keys(ROUTE_REQUIREMENTS)];

export function pagePathFor(pathname: string): string {
  const pattern = KNOWN_ROUTE_PATTERNS.find((candidate) => matchPath(candidate, pathname));
  return pattern ?? '/*';
}
