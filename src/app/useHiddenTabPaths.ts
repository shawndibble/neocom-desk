import { useMemo } from 'react';
import { tabPath } from '@/lib/pageTabs';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import { useHasProductionLogs } from '@/features/industry/useHasProductionLogs';
import { MOONS_TAB_PATHS, useMoonsTabsHidden } from '@/features/corp/moons/moonsTabsHidden';

const NONE: ReadonlySet<string> = new Set();
const NO_LOGS: ReadonlySet<string> = new Set([tabPath(INDUSTRY_TABS, 'logs')]);

/**
 * Page tabs the nav leaves out right now, for the rail and the command
 * palette: Industry › Logs until the active Character has logged a Production
 * Run, and Moons' tabs until the corporation has chosen a book mode.
 */
export function useHiddenTabPaths(): ReadonlySet<string> {
  const hasLogs = useHasProductionLogs();
  const moonsUnchosen = useMoonsTabsHidden();
  return useMemo(
    () =>
      hasLogs && !moonsUnchosen
        ? NONE
        : new Set([...(hasLogs ? [] : NO_LOGS), ...(moonsUnchosen ? MOONS_TAB_PATHS : [])]),
    [hasLogs, moonsUnchosen]
  );
}
