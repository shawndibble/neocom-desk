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
 *
 * Every row is a blueprint, so the tree's roots are the children of the
 * "Blueprints & Reactions" market group (`BLUEPRINT_ROOT_GROUP_ID`), not that
 * group itself. A blueprint the market doesn't list there (most T2 originals,
 * or the odd one filed under Trade Goods) is placed by what it makes: the
 * product's market group is looked up in `blueprintGroupOfProductGroup` (where
 * the listed blueprints making that kind of product already sit); failing
 * that its path is followed down the blueprint tree by name, and whatever part
 * of the path has no blueprint twin is added as extra groups.
 */

import { byName } from '../compare';

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
  /** The market group of what the blueprint makes; places it when its own group can't. */
  productMarketGroupId?: number | null;
}

export const OTHER_GROUP_ID = -1;
/** The market group every blueprint and reaction formula hangs under. */
export const BLUEPRINT_ROOT_GROUP_ID = 2;
/** Groups added for a product's path get ids no market group has: below Other's. */
const productGroupId = (marketGroupId: number) => -(marketGroupId + 1000);

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

function finish(group: Omit<ShareGroup, 'total'>): ShareGroup {
  group.types.sort(byName);
  group.children.sort(byName);
  return {
    ...group,
    total: group.types.length + group.children.reduce((sum, child) => sum + child.total, 0),
  };
}

/** A market group and its ancestors, root first. */
function groupPath(byId: ReadonlyMap<number, ShareMarketGroup>, id: number): ShareMarketGroup[] {
  const path: ShareMarketGroup[] = [];
  for (let at = byId.get(id); at; at = at.parentId === null ? undefined : byId.get(at.parentId)) {
    path.unshift(at);
  }
  return path;
}

/** Strictly below the Blueprints & Reactions group: the group itself is not a place. */
const isBlueprintGroup = (byId: ReadonlyMap<number, ShareMarketGroup>, id: number) =>
  id !== BLUEPRINT_ROOT_GROUP_ID && groupPath(byId, id)[0]?.id === BLUEPRINT_ROOT_GROUP_ID;

/**
 * For each market group of products, the blueprint market group most of its
 * listed blueprints sit in: the blueprint tree and the product tree are named
 * differently in places (Turrets & Bays against Turrets & Launchers).
 */
export function blueprintGroupOfProductGroup(
  blueprints: readonly BlueprintTypeInfo[],
  groups: readonly ShareMarketGroup[]
): Map<number, number> {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const counts = new Map<number, Map<number, number>>();
  for (const { marketGroupId, productMarketGroupId } of blueprints) {
    if (
      marketGroupId === null ||
      productMarketGroupId == null ||
      !isBlueprintGroup(byId, marketGroupId)
    )
      continue;
    const forProduct = counts.get(productMarketGroupId) ?? new Map<number, number>();
    forProduct.set(marketGroupId, (forProduct.get(marketGroupId) ?? 0) + 1);
    counts.set(productMarketGroupId, forProduct);
  }
  const result = new Map<number, number>();
  for (const [productGroup, forProduct] of counts) {
    const [best] = [...forProduct].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    result.set(productGroup, best[0]);
  }
  return result;
}

/**
 * Owned blueprint types nested under their market-group path. Groups holding
 * none are pruned; unlisted types go in a last root named `otherName`.
 */
export function buildShareTree(
  owned: readonly BlueprintTypeInfo[],
  groups: readonly ShareMarketGroup[],
  otherName: string,
  learned: ReadonlyMap<number, number> = new Map()
): ShareGroup[] {
  const hasBlueprintRoot = groups.some((group) => group.id === BLUEPRINT_ROOT_GROUP_ID);
  const rawById = new Map(groups.map((group) => [group.id, group]));
  // The root itself disappears: its children become roots, and no other
  // market tree is shown (a blueprint filed in one is placed by its product).
  const allGroups: ShareMarketGroup[] = hasBlueprintRoot
    ? groups
        .filter((group) => isBlueprintGroup(rawById, group.id))
        .map((group) =>
          group.parentId === BLUEPRINT_ROOT_GROUP_ID ? { ...group, parentId: null } : group
        )
    : [...groups];

  // Where a product's path leaves the blueprint tree, groups are added.
  const addedIds = new Set<number>();
  function placeByProduct(productGroup: number | null | undefined): number | null {
    if (productGroup == null || !rawById.has(productGroup)) return null;
    const known = learned.get(productGroup);
    if (known !== undefined) return known;
    const path = groupPath(rawById, productGroup);
    let parent: number | null = null;
    let index = 0;
    for (; index < path.length; index++) {
      const twin = allGroups.find(
        (group) => group.parentId === parent && group.name === path[index].name
      );
      if (!twin) break;
      parent = twin.id;
    }
    for (; index < path.length; index++) {
      const id = productGroupId(path[index].id);
      if (!addedIds.has(id)) {
        addedIds.add(id);
        allGroups.push({ id, name: path[index].name, parentId: parent });
      }
      parent = id;
    }
    return parent;
  }

  const unique = new Map(owned.map((type) => [type.typeId, type]));
  const placeOf = new Map<number, number | null>();
  for (const type of unique.values()) {
    const own = type.marketGroupId;
    const listed =
      own !== null && rawById.has(own) && (!hasBlueprintRoot || isBlueprintGroup(rawById, own));
    placeOf.set(type.typeId, listed ? own : placeByProduct(type.productMarketGroupId));
  }

  const typesByGroup = new Map<number, BlueprintTypeInfo[]>();
  const unlisted: BlueprintTypeInfo[] = [];
  for (const type of unique.values()) {
    const place = placeOf.get(type.typeId) ?? null;
    if (place === null) {
      unlisted.push(type);
      continue;
    }
    const list = typesByGroup.get(place) ?? [];
    list.push(type);
    typesByGroup.set(place, list);
  }

  const childrenByParent = new Map<number | null, ShareMarketGroup[]>();
  for (const group of allGroups) {
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
