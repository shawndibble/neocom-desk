/**
 * The Community share picker's rules (issue #3599, ADR 0018), kept pure so the
 * component only draws. A Character's owned blueprints are bucketed into the
 * market-group tree; a selection is the set of blueprint *type ids* the
 * Character chose to share. Nothing is selected by default.
 *
 * A type id, not an item id: copies are consumed and re-seeded all the time,
 * and the later push (#3600) expands a chosen type to whatever instances are
 * owned then. Blueprints the market doesn't list (most T2 originals) go in a
 * trailing Other bucket so every owned blueprint can still be picked.
 */

/** The market-group tree row, as `sde/marketTypes.ts` publishes it. */
export interface ShareMarketGroup {
  id: number;
  name: string;
  parentId: number | null;
}

/** One owned blueprint type. `marketGroupId` is null when the market doesn't list it. */
export interface BlueprintTypeInfo {
  typeId: number;
  name: string;
  marketGroupId: number | null;
}

export const OTHER_GROUP_ID = -1;

export interface ShareGroup {
  id: number;
  name: string;
  /** Owned blueprint types listed directly in this group, by name. */
  types: BlueprintTypeInfo[];
  children: ShareGroup[];
  /** Owned blueprint types in this group and everything below it. */
  total: number;
}

export type GroupState = 'none' | 'some' | 'all';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function finish(group: Omit<ShareGroup, 'total'>): ShareGroup {
  group.types.sort(byName);
  group.children.sort(byName);
  return {
    ...group,
    total: group.types.length + group.children.reduce((sum, child) => sum + child.total, 0),
  };
}

/**
 * Owned blueprint types nested under their market-group path. Groups holding
 * none are pruned; unlisted types go in a last root named `otherName`.
 */
export function buildShareTree(
  owned: readonly BlueprintTypeInfo[],
  groups: readonly ShareMarketGroup[],
  otherName: string
): ShareGroup[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const unique = new Map(owned.map((type) => [type.typeId, type]));

  const typesByGroup = new Map<number, BlueprintTypeInfo[]>();
  const unlisted: BlueprintTypeInfo[] = [];
  for (const type of unique.values()) {
    if (type.marketGroupId !== null && groupsById.has(type.marketGroupId)) {
      const list = typesByGroup.get(type.marketGroupId) ?? [];
      list.push(type);
      typesByGroup.set(type.marketGroupId, list);
    } else {
      unlisted.push(type);
    }
  }

  const childrenByParent = new Map<number | null, ShareMarketGroup[]>();
  for (const group of groups) {
    const list = childrenByParent.get(group.parentId) ?? [];
    list.push(group);
    childrenByParent.set(group.parentId, list);
  }

  function build(group: ShareMarketGroup): ShareGroup | null {
    const children = (childrenByParent.get(group.id) ?? [])
      .map(build)
      .filter((child): child is ShareGroup => child !== null);
    const types = typesByGroup.get(group.id) ?? [];
    if (types.length === 0 && children.length === 0) return null;
    return finish({ id: group.id, name: group.name, types: [...types], children });
  }

  const roots = (childrenByParent.get(null) ?? [])
    .map(build)
    .filter((root): root is ShareGroup => root !== null)
    .sort(byName);
  if (unlisted.length > 0) {
    roots.push(finish({ id: OTHER_GROUP_ID, name: otherName, types: [...unlisted], children: [] }));
  }
  return roots;
}

/** Every blueprint type id in a group and below, as the tree currently shows it. */
export function descendantTypeIds(group: ShareGroup): number[] {
  return [...group.types.map((type) => type.typeId), ...group.children.flatMap(descendantTypeIds)];
}

export function groupState(group: ShareGroup, selected: ReadonlySet<number>): GroupState {
  const ids = descendantTypeIds(group);
  const chosen = ids.filter((id) => selected.has(id)).length;
  if (chosen === 0) return 'none';
  return chosen === ids.length ? 'all' : 'some';
}

/** A full category clears; a partial or empty one fills up. */
export function toggleGroup(group: ShareGroup, selected: ReadonlySet<number>): Set<number> {
  const next = new Set(selected);
  const ids = descendantTypeIds(group);
  if (groupState(group, selected) === 'all') ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

export function toggleType(selected: ReadonlySet<number>, typeId: number): Set<number> {
  const next = new Set(selected);
  if (!next.delete(typeId)) next.add(typeId);
  return next;
}

export function selectAll(owned: readonly BlueprintTypeInfo[]): Set<number> {
  return new Set(owned.map((type) => type.typeId));
}

/** Only blueprints still owned count: a saved choice can outlive a consumed copy. */
export function countSelected(
  selected: ReadonlySet<number>,
  owned: readonly BlueprintTypeInfo[]
): number {
  return new Set(owned.filter((type) => selected.has(type.typeId)).map((type) => type.typeId)).size;
}

/** Blueprints whose name contains `query` (any case), with the groups above them. */
export function filterShareTree(roots: readonly ShareGroup[], query: string): ShareGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...roots];
  function filter(group: ShareGroup): ShareGroup | null {
    const types = group.types.filter((type) => type.name.toLowerCase().includes(needle));
    const children = group.children
      .map(filter)
      .filter((child): child is ShareGroup => child !== null);
    if (types.length === 0 && children.length === 0) return null;
    return finish({ id: group.id, name: group.name, types, children });
  }
  return roots.map(filter).filter((group): group is ShareGroup => group !== null);
}
