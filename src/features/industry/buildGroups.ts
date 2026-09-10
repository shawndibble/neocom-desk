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
 * ## Writing a group and its membership together
 *
 * A group's existence lives here and its membership lives on the plans, so
 * creating or deleting one is two writes that cannot be atomic. One rule keeps
 * every intermediate state legible, and both callers in `routes/Industry.tsx`
 * follow it even though it makes their write orders opposite:
 *
 * **The group outlives the membership pointing at it** — created before its
 * plans, removed after they have let go. Each half is already a first-class
 * state on its own: an empty group is exactly what sits on screen between
 * "create" and the first plan moved in, and a plan whose group is missing
 * renders as an ordinary ungrouped plan. So a torn write shows one of those
 * two rather than anything the list cannot draw.
 *
 * Everything below is pure. The Dexie read and the `setSyncedSetting` write
 * live in the store at the bottom, the same split `customsOverride.ts` uses.
 */

import { FACILITY_PRESETS, type FacilityKind, type SecurityBand } from '@/engine/industry/types';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import { coerceArrayEntry, parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export const SYNCED_BUILD_GROUPS_KEY = 'sync.industryBuildGroups';

/**
 * What a group's members were last bulk-set to by "Retarget group" (issue
 * #632) — a snapshot, not a live value. Read by exactly two UI affordances,
 * the per-plan quick-fill link and (were the group empty) nothing else, and
 * never by a calculation engine: the actual hub, facility, security and
 * build system live only on each plan, same as the #626 decision this stays
 * consistent with. A group carrying this is not a second writer for those
 * facts — it is a clipboard the pilot fills by hand and pastes from later.
 */
export interface BuildGroupSnapshot {
  hubId: TradeHub['id'];
  facility: FacilityKind;
  security: SecurityBand;
  /**
   * One fact, routed as a pair — the same rule `planSync.ts`'s `toRemoteDoc`
   * applies to a plan's own `buildSystemId`/`buildSystemName`: a system
   * without its name, or a name without its id, is worse than no system at
   * all, so both are present or neither is.
   */
  buildSystemId?: number;
  buildSystemName?: string;
  /** When the group was last Retargeted onto these values. */
  appliedAt: number;
}

/**
 * A Build Group's last-used Craft Sweep (issue #696): a convenience default
 * only, the same "clipboard, not a second writer" role `BuildGroupSnapshot`
 * plays for Retarget — reopening the group pre-fills `CraftSweepControl`
 * with these, but nothing here re-applies automatically and no plan's own
 * `buildHere` is read from it.
 */
export interface BuildGroupCraftSweepDefault {
  strategy: SweepStrategy;
  /**
   * The raw control choice, `'all'` sentinel included — not the depth number
   * it resolved to that run. A stored numeric depth could outlive the tree
   * it was measured against (a member removed, or replaced by a shallower
   * blueprint) and silently fall outside the next reopening's own depth
   * range; `'all'` never can.
   */
  depthChoice: 'all' | number;
}

/** One Build Group: what it is called and where it sits in the list. */
export interface BuildGroup {
  id: string;
  name: string;
  /** Position among the Character's groups. Contiguous from 0 after any edit. */
  order: number;
  /** @see BuildGroupSnapshot */
  snapshot?: BuildGroupSnapshot;
  /** @see BuildGroupCraftSweepDefault */
  craftSweepDefault?: BuildGroupCraftSweepDefault;
}

/** Every Character's groups, in one value — see the module comment. */
export type BuildGroupsValue = Record<number, BuildGroup[]>;

function usableSnapshot(value: unknown): value is BuildGroupSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const { hubId, facility, security, buildSystemId, buildSystemName, appliedAt } =
    value as Partial<BuildGroupSnapshot>;
  return (
    typeof hubId === 'string' &&
    TRADE_HUBS.some((hub) => hub.id === hubId) &&
    typeof facility === 'string' &&
    facility in FACILITY_PRESETS &&
    (security === 'highsec' || security === 'lowsec' || security === 'nullsec') &&
    (buildSystemId === undefined) === (buildSystemName === undefined) &&
    (buildSystemId === undefined || typeof buildSystemId === 'number') &&
    (buildSystemName === undefined || typeof buildSystemName === 'string') &&
    typeof appliedAt === 'number' &&
    Number.isFinite(appliedAt)
  );
}

function usableCraftSweepDefault(value: unknown): value is BuildGroupCraftSweepDefault {
  if (typeof value !== 'object' || value === null) return false;
  const { strategy, depthChoice } = value as Partial<BuildGroupCraftSweepDefault>;
  return (
    (strategy === 'buy' || strategy === 'build' || strategy === 'cost-effective') &&
    (depthChoice === 'all' ||
      (typeof depthChoice === 'number' && Number.isFinite(depthChoice) && depthChoice > 0))
  );
}

function usableGroup(value: unknown): value is BuildGroup {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, order, snapshot, craftSweepDefault } = value as Partial<BuildGroup>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof name === 'string' &&
    name.trim() !== '' &&
    typeof order === 'number' &&
    Number.isFinite(order) &&
    (snapshot === undefined || usableSnapshot(snapshot)) &&
    (craftSweepDefault === undefined || usableCraftSweepDefault(craftSweepDefault))
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
  return parseCharacterKeyedRecord(raw, (value) => coerceArrayEntry(value, usableGroup)) ?? {};
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

/**
 * The value with one group's Retarget snapshot set (or replaced). A no-op
 * for a group id that does not exist, the same guard `renameBuildGroup`
 * applies — Retarget reads its target group from the same render this
 * writes from, so a stale id here means the group was deleted underneath
 * the open dialog, not a bug to surface.
 */
export function withGroupSnapshot(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  snapshot: BuildGroupSnapshot
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, snapshot } : g))
  );
}

/**
 * The value with one group's last-used Craft Sweep default set (or
 * replaced). Same no-op-for-a-missing-group guard as `withGroupSnapshot`.
 */
export function withGroupCraftSweepDefault(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  craftSweepDefault: BuildGroupCraftSweepDefault
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, craftSweepDefault } : g))
  );
}

/** The cross-device store. Value, `hydrated`, `hydrate`, `setValue`. */
export const useBuildGroups = createSyncedSetting<BuildGroupsValue>({
  key: SYNCED_BUILD_GROUPS_KEY,
  defaultValue: {},
  parse: parseBuildGroups,
});
