import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trackPageView } from './analytics';
import { documentTitleFor } from './documentTitle';
import { pagePathFor } from './pagePathFor';
import { isTabRedirectPath } from './pageTabs';

export function AnalyticsPageViewTracker(): null {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (isTabRedirectPath(location.pathname)) return;
    void trackPageView(
      pagePathFor(location.pathname),
      documentTitleFor(location.pathname, (key) => t(key))
    );
  }, [location.pathname, t]);

  return null;
}
