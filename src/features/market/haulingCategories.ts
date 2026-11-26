import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

export const HAULING_CATEGORY_IDS = [11, 9, 157, 24, 19, 955, 1320, 475, 477, 2203, 2202] as const;

export const EVERYTHING_CATEGORY_ID = 0;

export const HAULING_CATEGORY_OPTIONS = [EVERYTHING_CATEGORY_ID, ...HAULING_CATEGORY_IDS] as const;

export const DEFAULT_HAULING_CATEGORY_ID = 11;

export function isHaulingCategoryId(id: number): boolean {
  return (HAULING_CATEGORY_OPTIONS as readonly number[]).includes(id);
}

export function typeIdsInHaulingCategory(
  categoryId: number,
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[]
): number[] {
  return typeIdsInCategories(
    categoryId === EVERYTHING_CATEGORY_ID ? HAULING_CATEGORY_IDS : [categoryId],
    groups,
    types
  );
}

export function typeIdsInCategory(
  rootId: number,
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[]
): number[] {
  return typeIdsInCategories([rootId], groups, types);
}

function typeIdsInCategories(
  rootIds: readonly number[],
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[]
): number[] {
  const children = new Map<number, number[]>();
  for (const group of groups) {
    if (group.parentId === null) continue;
    const siblings = children.get(group.parentId) ?? [];
    siblings.push(group.id);
    children.set(group.parentId, siblings);
  }
  const inTree = new Set<number>(rootIds);
  const queue = [...rootIds];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (!inTree.has(child)) {
        inTree.add(child);
        queue.push(child);
      }
    }
  }
  return types
    .filter((t) => inTree.has(t.marketGroupId))
    .map((t) => t.typeId)
    .sort((a, b) => a - b);
}

export function haulingCategoryOf(
  typeIds: readonly number[],
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[]
): Map<number, number> {
  const wanted = new Set(typeIds);
  const parentOf = new Map(groups.map((g) => [g.id, g.parentId]));
  const roots = new Set<number>(HAULING_CATEGORY_IDS);
  const byType = new Map<number, number>();
  for (const type of types) {
    if (!wanted.has(type.typeId)) continue;
    for (
      let id: number | null | undefined = type.marketGroupId;
      id != null;
      id = parentOf.get(id)
    ) {
      if (roots.has(id)) {
        byType.set(type.typeId, id);
        break;
      }
    }
  }
  return byType;
}
