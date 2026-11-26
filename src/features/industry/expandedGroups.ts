import { coerceArrayEntry, parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createLocalSetting } from '@/lib/useLocalSetting';

export type ExpandedGroupsValue = Record<number, string[]>;

const EXPANDED_GROUPS_KEY = 'industryExpandedGroups';

export function parseExpandedGroups(raw: unknown): ExpandedGroupsValue | null {
  return parseCharacterKeyedRecord(raw, (ids) =>
    coerceArrayEntry(ids, (id): id is string => typeof id === 'string' && id !== '')
  );
}

export const useExpandedGroups = createLocalSetting<ExpandedGroupsValue>({
  key: EXPANDED_GROUPS_KEY,
  defaultValue: {},
  parse: parseExpandedGroups,
});

export function withGroupExpanded(
  value: ExpandedGroupsValue,
  characterId: number,
  groupId: string,
  expanded: boolean
): ExpandedGroupsValue {
  const current = value[characterId] ?? [];
  if (current.includes(groupId) === expanded) return value;
  const next = expanded ? [...current, groupId] : current.filter((id) => id !== groupId);
  const out = { ...value };
  if (next.length === 0) delete out[characterId];
  else out[characterId] = next;
  return out;
}
