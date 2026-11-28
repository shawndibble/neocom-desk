import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { documentTitleFor } from './documentTitle';
import { MOONS_TAB_PATHS, useMoonsTabsHidden } from '@/features/corp/moons/moonsTabsHidden';

export function useRouteTitle(openName: string | null = null): string {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const moonsHidden = useMoonsTabsHidden();
  const hiddenTabPaths = moonsHidden ? new Set(MOONS_TAB_PATHS) : undefined;
  return documentTitleFor(pathname, (key) => t(key), hiddenTabPaths, openName);
}
