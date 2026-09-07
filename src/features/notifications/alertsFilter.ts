/**
 * What the Alerts page's toolbar narrows the by-type list down to.
 *
 * Split from `alertGroups.ts` for the reason `openOrdersFilter.ts` sits apart
 * from `openOrdersModel.ts`: grouping is what the data *is*, filtering is what
 * this one view is currently asking of it, and the Overview's alerts column
 * consumes the first without wanting any of the second.
 *
 * The character filter is deliberately NOT here — it applies to entries, not
 * groups, and a group filtered after the fact would keep a count that includes
 * the characters it just dropped. The page filters entries first and groups
 * what survives.
 *
 * Pure: no fetch/DOM/Dexie, no clock.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import type { AlertTypeGroup } from './alertGroups';

/**
 * A group with what only the view can resolve attached: its human name (needs
 * a translator) and whether its type is currently silenced (needs the
 * character's stored preferences).
 */
export interface DisplayAlertGroup extends AlertTypeGroup {
  label: string;
  muted: boolean;
}

export interface AlertsFilter {
  query: string;
  /** null shows every Character on the device — what this page is for. */
  characterId: number | null;
  /** Empty means every severity. A set of all four would mean the same thing, but nothing writes that. */
  severities: ReadonlySet<DeadlineSeverity>;
  showMuted: boolean;
}

export const EMPTY_ALERTS_FILTER: AlertsFilter = {
  query: '',
  characterId: null,
  severities: new Set(),
  showMuted: false,
};

/**
 * A group matches a query on its own name or on what any of its alerts
 * actually said.
 *
 * Both, because the two answer different questions. "Structure fuel low" is
 * the type; "Ahbazon" is the only part a pilot actually remembers, and it
 * exists only in the body of one fire.
 */
function matchesQuery(group: DisplayAlertGroup, query: string): boolean {
  if (group.label.toLowerCase().includes(query)) return true;
  return group.entries.some(
    (entry) => entry.title.toLowerCase().includes(query) || entry.body.toLowerCase().includes(query)
  );
}

export function filterAlertGroups(
  groups: readonly DisplayAlertGroup[],
  filter: AlertsFilter
): DisplayAlertGroup[] {
  const query = filter.query.trim().toLowerCase();
  return groups.filter((group) => {
    if (group.muted && !filter.showMuted) return false;
    if (filter.severities.size > 0 && !filter.severities.has(group.severity)) return false;
    if (query.length > 0 && !matchesQuery(group, query)) return false;
    return true;
  });
}

/** How many filters are set away from their default — badges the narrow-width trigger. */
export function activeAlertsFilterCount(filter: AlertsFilter): number {
  return (
    (filter.query.trim().length > 0 ? 1 : 0) +
    (filter.characterId !== null ? 1 : 0) +
    filter.severities.size +
    (filter.showMuted ? 1 : 0)
  );
}
