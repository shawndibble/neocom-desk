import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { documentTitleFor } from './documentTitle';
import { MOONS_TAB_PATHS, useMoonsTabsHidden } from '@/features/corp/moons/moonsTabsHidden';

export function DocumentTitleTracker(): null {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const moonsHidden = useMoonsTabsHidden();
  const hiddenTabPaths = useMemo(
    () => (moonsHidden ? new Set(MOONS_TAB_PATHS) : undefined),
    [moonsHidden]
  );

  useEffect(() => {
    document.title = documentTitleFor(pathname, (key) => t(key), hiddenTabPaths);
  }, [pathname, t, hiddenTabPaths]);

  return null;
}
