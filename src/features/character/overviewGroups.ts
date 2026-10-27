/**
 * Overview character groupings: device-local, per parity plan §5.7 — same
 * rationale as skills/comparisons.ts. A grouping is a statement about several
 * characters at once, so it cannot live under any single character's sync
 * scope, and EVE SSO offers no account identity to hang it on. Stored as one
 * array-valued key carrying its own updatedAt, shaped like a synced key would
 * be but without the `sync.` prefix that would turn syncing on.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { CharacterGroup } from './groups';

export interface OverviewGroupsValue {
  groups: CharacterGroup[];
  updatedAt: number;
}

export const OVERVIEW_GROUPS_SETTING_KEY = 'overviewGroups';

const DEFAULT_VALUE: OverviewGroupsValue = { groups: [], updatedAt: 0 };

function isCharacterGroup(value: unknown): value is CharacterGroup {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CharacterGroup>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.characterIds) &&
    candidate.characterIds.every((id) => typeof id === 'number')
  );
}

function parseOverviewGroupsValue(raw: unknown): OverviewGroupsValue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<OverviewGroupsValue>;
  if (!Array.isArray(candidate.groups) || !candidate.groups.every(isCharacterGroup)) return null;
  if (typeof candidate.updatedAt !== 'number') return null;
  return { groups: candidate.groups, updatedAt: candidate.updatedAt };
}

export const useOverviewGroups = createLocalSetting<OverviewGroupsValue>({
  key: OVERVIEW_GROUPS_SETTING_KEY,
  defaultValue: DEFAULT_VALUE,
  parse: parseOverviewGroupsValue,
});

/** Applies a `groups.ts` mutator to a value and stamps `updatedAt` — the one place that pairing happens. */
export function updateGroups(
  value: OverviewGroupsValue,
  updater: (groups: CharacterGroup[]) => CharacterGroup[],
  nowMs: number
): OverviewGroupsValue {
  return { groups: updater(value.groups), updatedAt: nowMs };
}
