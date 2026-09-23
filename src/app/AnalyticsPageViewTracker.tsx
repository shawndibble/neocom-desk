/**
 * Fires a GA4 `page_view` on every route change. Firebase Analytics (unlike
 * a raw gtag.js snippet with Enhanced Measurement's history-change tracking)
 * does not listen for `pushState` itself, so this is the only source of
 * page_view events — no double-counting.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';
import { pagePathFor } from './pagePathFor';
import { isTabRedirectPath } from './pageTabs';

export function AnalyticsPageViewTracker(): null {
  const location = useLocation();

  useEffect(() => {
    // `/contacts` is replaced by `/contacts/character` a render later; count
    // the tab, not the redirect, or every rail click is two page views.
    if (isTabRedirectPath(location.pathname)) return;
    void trackPageView(pagePathFor(location.pathname));
  }, [location.pathname]);

  return null;
}
