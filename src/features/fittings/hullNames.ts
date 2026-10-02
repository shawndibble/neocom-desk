/**
 * Every hull's name, lower-cased: each market type filed under the Ships
 * root Market Group. The market tree rather than the Ship Tree, which leaves
 * out special-edition and event hulls a pilot can still fit and paste.
 */
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

/** `market/groups.json`'s "Ships" root (`parentId: null`). */
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
    // Mark before recursing, so a malformed cycle ends instead of overflowing.
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

let hullNamesPromise: Promise<ReadonlySet<string>> | null = null;

export function loadHullNames(): Promise<ReadonlySet<string>> {
  hullNamesPromise ??= Promise.all([loadMarketTypes(), loadMarketGroups()])
    .then(([types, groups]) => hullNamesFrom(types, groups))
    .catch((error: unknown) => {
      hullNamesPromise = null; // allow retry after failure
      throw error;
    });
  return hullNamesPromise;
}
