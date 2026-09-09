/**
 * **Build Group** names, order and existence — the half of a group that is not
 * membership (issue #626, CONTEXT.md "Build Group").
 *
 * ## Why this is a setting and not a table
 *
 * Membership lives on the plan, as `BuildPlanRecord.buildGroupId`, so there is
 * exactly one writer for "which group is this plan in". What is left — a name,
 * an ordinal, and the bare fact that a group exists — is what lives here.
 *
 * That last one is the whole reason this file exists at all. A group could
 * otherwise be derived by grouping the plans, with no stored value anywhere;
 * but a derived group cannot be **empty**, and an empty group is exactly what
 * sits on screen between "create a group" and the first plan moved into it.
 *
 * A synced *setting* rather than a synced *collection* because a new
 * collection would need a `firestore.rules` clause deployed by hand — and a
 * denied collection does not degrade, it throws, taking the whole sync pass
 * (Skill Plans included) down with it. See the scope decision.
 *
 * ## One key for every group, not one per group
 *
 * `mergeSettings` is whole-value last-write-wins per key and
 * `SYNCED_SETTING_KEYS` is an exact-match allow-list, so a per-group key
 * scheme is not expressible without weakening that list into a prefix match —
 * the same trade `customsOverride.ts` and `syncedPreferences.ts` document and
 * accept. Two devices creating *different* groups before either syncs can have
 * one clobber the other. What is lost then is a name and an ordinal; the
 * plans' own `buildGroupId`s are per-record and are not in this blob, so no
 * plan can be dragged into the wrong group by a merge.
 *
 * Keyed per Character inside the one key, like `LastOpenedPlanValue` and
 * `CustomsOverrides` — the local settings read is unfiltered across Characters,
 * so one key has to carry all of them.
 *
 * Everything below is pure. The Dexie read and the `setSyncedSetting` write
 * live in the store at the bottom, the same split `customsOverride.ts` uses.
 */

import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_BUILD_GROUPS_KEY = 'sync.industryBuildGroups';

/** One Build Group: what it is called and where it sits in the list. */
export interface BuildGroup {
  id: string;
  name: string;
  /** Position among the Character's groups. Contiguous from 0 after any edit. */
  order: number;
}

/** Every Character's groups, in one value — see the module comment. */
export type BuildGroupsValue = Record<number, BuildGroup[]>;

function usableGroup(value: unknown): value is BuildGroup {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, order } = value as Partial<BuildGroup>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof name === 'string' &&
    name.trim() !== '' &&
    typeof order === 'number' &&
    Number.isFinite(order)
  );
}

/**
 * The stored blob, validated.
 *
 * Every entry is checked rather than trusted: this value is whatever the last
 * device to sync wrote, which may be an older build or a row edited by hand. A
 * group with no id cannot be selected, and one with no name renders as a blank
 * row the pilot cannot tell from a bug — so neither is kept.
 */
export function parseBuildGroups(raw: unknown): BuildGroupsValue {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: BuildGroupsValue = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const characterId = Number(key);
    if (!Number.isInteger(characterId) || characterId <= 0) continue;
    if (!Array.isArray(value)) continue;
    const groups = value.filter(usableGroup);
    // An entry that survives validation with nothing in it is stored as
    // nothing, so "had groups once" and "never had any" are the same value.
    if (groups.length > 0) out[characterId] = groups;
  }
  return out;
}

/** One Character's groups, lowest `order` first. */
export function buildGroupsFor(value: BuildGroupsValue, characterId: number): BuildGroup[] {
  return [...(value[characterId] ?? [])].sort((a, b) => a.order - b.order);
}

/** Renumbers to a contiguous 0..n-1 so an order can never collide or gap. */
function renumbered(groups: readonly BuildGroup[]): BuildGroup[] {
  return groups.map((group, index) => ({ ...group, order: index }));
}

/** The value with one Character's list replaced, dropping the entry when empty. */
export function withBuildGroups(
  value: BuildGroupsValue,
  characterId: number,
  groups: readonly BuildGroup[]
): BuildGroupsValue {
  const next = { ...value };
  if (groups.length === 0) delete next[characterId];
  else next[characterId] = renumbered(groups);
  return next;
}

/** The value with a new group appended after that Character's existing ones. */
export function addBuildGroup(
  value: BuildGroupsValue,
  characterId: number,
  group: { id: string; name: string }
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  return withBuildGroups(value, characterId, [
    ...existing,
    { id: group.id, name: group.name.trim(), order: existing.length },
  ]);
}

/**
 * The value with one group renamed. A blank name is ignored rather than
 * stored: `parseBuildGroups` would drop the group on the next read, so
 * accepting one here would delete a group through the rename control.
 */
export function renameBuildGroup(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  name: string
): BuildGroupsValue {
  const trimmed = name.trim();
  if (trimmed === '') return value;
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g))
  );
}

/**
 * The value with one group gone. Its member plans are *not* touched here —
 * clearing their `buildGroupId` is a Dexie write the caller makes, and a plan
 * left pointing at a group that no longer exists renders as an ordinary
 * ungrouped plan rather than a broken group of one.
 */
export function removeBuildGroup(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  return withBuildGroups(
    value,
    characterId,
    existing.filter((g) => g.id !== groupId)
  );
}

/** The cross-device store. Value, `hydrated`, `hydrate`, `setValue`. */
export const useBuildGroups = createSyncedSetting<BuildGroupsValue>({
  key: SYNCED_BUILD_GROUPS_KEY,
  defaultValue: {},
  parse: parseBuildGroups,
});
