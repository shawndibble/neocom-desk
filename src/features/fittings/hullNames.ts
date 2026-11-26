import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { SHIP_CATEGORY_ID } from '@/sde/categories';
import type { TypeMap } from '@/sde/types';

const SHIPS_ROOT_MARKET_GROUP = 4;

export function hullNamesFrom(
  types: readonly MarketTypeEntry[],
  groups: readonly MarketGroupNode[]
): Set<string> {
  const parentOf = new Map(groups.map((group) => [group.id, group.parentId]));
  const underShips = new Map<number, boolean>();
  const isUnderShips = (groupId: number): boolean => {
    const known = underShips.get(groupId);
    if (known !== undefined) return known;
    underShips.set(groupId, false);
    const parent = parentOf.get(groupId);
    const result =
      groupId === SHIPS_ROOT_MARKET_GROUP ||
      (parent !== undefined && parent !== null && isUnderShips(parent));
    underShips.set(groupId, result);
    return result;
  };

  const names = new Set<string>();
  for (const type of types) {
    if (isUnderShips(type.marketGroupId)) names.add(type.name.toLowerCase());
  }
  return names;
}

export function hullNamesFromTypes(
  types: TypeMap,
  categories: Readonly<Record<string, number>>
): Set<string> {
  const names = new Set<string>();
  for (const type of Object.values(types)) {
    if (categories[String(type.groupID)] === SHIP_CATEGORY_ID) names.add(type.name.toLowerCase());
  }
  return names;
}

let hullNamesPromise: Promise<ReadonlySet<string>> | null = null;

export function loadHullNames(): Promise<ReadonlySet<string>> {
  const market = (hullNamesPromise ??= Promise.all([loadMarketTypes(), loadMarketGroups()])
    .then(([types, groups]) => hullNamesFrom(types, groups))
    .catch((error: unknown) => {
      hullNamesPromise = null;
      throw error;
    }));
  return market.catch(() =>
    Promise.all([loadTypes(), loadGroupCategories()]).then(([types, categories]) =>
      hullNamesFromTypes(types, categories)
    )
  );
}
