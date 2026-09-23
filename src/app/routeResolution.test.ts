/**
 * Sweep test (issue #1308): every tab path and every notification-generated
 * URL must resolve to a real route, never fall through to the `*` NotFound
 * catch-all. Built from the same tables the app itself renders from
 * (`ROUTE_REQUIREMENTS`, `PAGE_TABS`, `NOTIFICATION_ROUTES`/`SUBJECT_URLS`)
 * rather than a hand-copied path list, so a route renamed on one side shows
 * up here without the test itself needing an edit.
 */
import { describe, it, expect } from 'vitest';
import { matchPath } from 'react-router-dom';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from './routeScopes';
import { PAGE_TABS, routePatternFor } from './pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { industryTabHref } from '@/features/industry/industryTabs';
import {
  NOTIFICATION_ROUTES,
  NOTIFICATION_FALLBACK_ROUTE,
  SUBJECT_ROUTED_EVENT_IDS,
  notificationUrlForSubject,
} from '@/features/notifications/notificationOptions';

// The routes App.tsx mounts outside FEATURE_ROUTES/RequireCharacter.
const STATIC_ROUTES = ['/', '/login', '/callback', '/styleguide', '/share/appraisal', '/error'];

const FEATURE_PATTERNS = (Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[]).map(routePatternFor);

const ALL_PATTERNS = [...STATIC_ROUTES, ...FEATURE_PATTERNS];

function resolves(pathname: string): boolean {
  const [path] = pathname.split('?');
  return ALL_PATTERNS.some((pattern) => matchPath(pattern, path) !== null);
}

describe('every route pattern the app mounts', () => {
  it.each(ALL_PATTERNS)('%s is a valid react-router pattern', (pattern) => {
    expect(() => matchPath(pattern, '/__probe__')).not.toThrow();
  });
});

describe('every declared tab path resolves', () => {
  const tabPaths = Object.values(PAGE_TABS).flatMap((page) =>
    page.tabs.map((tab) => tabPath(page, tab.id))
  );

  it.each(tabPaths)('%s resolves to a mounted route', (path) => {
    expect(resolves(path)).toBe(true);
  });
});

describe('every notification event resolves', () => {
  it.each(Object.entries(NOTIFICATION_ROUTES))('%s -> %s resolves', (_eventId, url) => {
    expect(resolves(url)).toBe(true);
  });

  it('the fallback route resolves', () => {
    expect(resolves(NOTIFICATION_FALLBACK_ROUTE)).toBe(true);
  });

  it.each(SUBJECT_ROUTED_EVENT_IDS)('%s resolves once a subject id is applied', (eventId) => {
    expect(resolves(notificationUrlForSubject(eventId, 123))).toBe(true);
  });
});

describe('legacy bookmark redirects resolve', () => {
  it('/bpc-contracts redirects into a real Industry tab', () => {
    expect(resolves(industryTabHref('sourcing'))).toBe(true);
  });
});
