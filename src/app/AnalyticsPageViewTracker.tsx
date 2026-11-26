import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';
import { pagePathFor } from './pagePathFor';
import { isTabRedirectPath } from './pageTabs';

export function AnalyticsPageViewTracker(): null {
  const location = useLocation();

  useEffect(() => {
    if (isTabRedirectPath(location.pathname)) return;
    void trackPageView(pagePathFor(location.pathname));
  }, [location.pathname]);

  return null;
}
