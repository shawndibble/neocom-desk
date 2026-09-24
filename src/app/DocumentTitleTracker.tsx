import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { documentTitleFor } from './documentTitle';

/** Keeps `document.title` naming the current route (and tab); see `documentTitle.ts`. */
export function DocumentTitleTracker(): null {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = documentTitleFor(pathname, (key) => t(key));
  }, [pathname, t, i18n.language]);

  return null;
}
