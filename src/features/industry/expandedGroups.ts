/**
 * Which **Build Group**s each Character has open in the plan list.
 *
 * Device-local, not Editable Data: it says what this screen is showing, not
 * what the pilot built. A phone left with everything collapsed must not fold
 * up the desktop.
 *
 * ## Expanded ids, deliberately not collapsed ones
 *
 * "Collapsed by default" then falls out of the empty default, and both failure
 * modes of the other choice disappear:
 *
 * - A group created on another device arrives in the synced settings blob
 *   without ever having been named here. Storing *collapsed* ids would make it
 *   arrive **expanded** — so importing a 25-plan fit on a laptop would unfold
 *   it on the phone too, which is the exact thing collapsing is for.
 * - A stored id whose group is gone is harmless here — the list only expands
 *   ids it still has groups for. Storing collapsed ids would instead
 *   accumulate rows pinning groups that no longer exist.
 *
 * Keyed by characterId: the plan list is scoped to the active Character, and
 * one flat set would be overwritten by whichever Character was looked at
 * last.
 */
import { coerceArrayEntry, parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createLocalSetting } from '@/lib/useLocalSetting';

/** characterId (as an object key) -> the ids of that Character's open groups. */
export type ExpandedGroupsValue = Record<number, string[]>;

export const EXPANDED_GROUPS_KEY = 'industryExpandedGroups';

/** Exported for its test — the store below is the only other caller. */
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

/** The value with one group's open/closed state flipped — other Characters untouched. */
export function withGroupExpanded(
  value: ExpandedGroupsValue,
  characterId: number,
  groupId: string,
  expanded: boolean
): ExpandedGroupsValue {
  const current = value[characterId] ?? [];
  // Tested against membership rather than against the rebuilt array: `filter`
  // returns a fresh array even when it removed nothing, so comparing the
  // results would report a change — and every caller persists on one.
  if (current.includes(groupId) === expanded) return value;
  const next = expanded ? [...current, groupId] : current.filter((id) => id !== groupId);
  const out = { ...value };
  // Nothing open is stored as nothing, so a Character who opened a group and
  // closed it again is byte-identical to one who never opened one.
  if (next.length === 0) delete out[characterId];
  else out[characterId] = next;
  return out;
}
