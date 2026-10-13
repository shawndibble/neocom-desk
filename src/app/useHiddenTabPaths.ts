import { useMemo } from 'react';
import { tabPath } from '@/lib/pageTabs';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import { useHasProductionLogs } from '@/features/industry/useHasProductionLogs';

const NONE: ReadonlySet<string> = new Set();
const NO_LOGS: ReadonlySet<string> = new Set([tabPath(INDUSTRY_TABS, 'logs')]);

/**
 * Page tabs the nav leaves out right now, for the rail and the command
 * palette: Industry › Logs until the active Character has logged a Production
 * Run.
 */
export function useHiddenTabPaths(): ReadonlySet<string> {
  const hasLogs = useHasProductionLogs();
  return useMemo(() => (hasLogs ? NONE : NO_LOGS), [hasLogs]);
}
