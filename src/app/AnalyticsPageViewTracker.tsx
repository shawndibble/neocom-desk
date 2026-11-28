import { useEffect, useEffectEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';
import { useRouteTitle } from './useRouteTitle';
import { pagePathFor } from './pagePathFor';
import { isTabRedirectPath } from './pageTabs';

export function AnalyticsPageViewTracker(): null {
  const { pathname } = useLocation();
  const title = useRouteTitle();
  const track = useEffectEvent(() => void trackPageView(pagePathFor(pathname), title));

  useEffect(() => {
    if (isTabRedirectPath(pathname)) return;
    track();
  }, [pathname]);

  return null;
}
