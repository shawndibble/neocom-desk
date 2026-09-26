/**
 * The market categories the Hauling Opportunities page can scan. A scan looks
 * at every tradable item under one category rather than the whole market:
 * each item costs price and history lookups, and a hauler thinking about a
 * niche ("faction ammo", "drones") is thinking in categories anyway.
 *
 * Ships are left out for now: a hull's hauled (packaged) volume differs from
 * the assembled one the catalogue carries, and getting it wrong would mislead
 * the one number the Trip Plan rests on.
 */
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

/** Market Group ids, by name in the SDE: Ammunition & Charges, Ship Equipment, Drones, Implants & Boosters, Trade Goods, Ship and Module Modifications, Planetary Infrastructure. */
export const HAULING_CATEGORY_IDS = [11, 9, 157, 24, 19, 955, 1320] as const;

export const DEFAULT_HAULING_CATEGORY_ID = 11;

export function isHaulingCategoryId(id: number): boolean {
  return (HAULING_CATEGORY_IDS as readonly number[]).includes(id);
}

/** Every type id under `rootId`, at any depth of the market-group tree, ascending. */
export function typeIdsInCategory(
  rootId: number,
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
  const inTree = new Set<number>([rootId]);
  const queue = [rootId];
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
