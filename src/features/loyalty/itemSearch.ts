/**
 * Item-first search across every LP Store (issue #2873): which corporations
 * sell an item, nearest first. Pure over the `lpStoreOffers` snapshot rows
 * (`functions/src/lpOffersSnapshot.ts`), a name lookup and the jumps from the
 * Current System.
 *
 * ESI's offers carry no home station, so a corporation is as far as its
 * nearest station: the snapshot lists every system it has one in. A store with
 * no reachable station (or no Current System yet) has `jumps: null` and sorts
 * after every store that has a distance.
 */
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { rankedSearch } from '@/lib/rankedSearch';

/** `[offerId, typeId, quantity, iskCost, lpCost, requiredItems: [typeId, quantity][]]` */
export type LpSnapshotOffer = [number, number, number, number, number, [number, number][]];

/** One corporation's row of the `lpStoreOffers` snapshot. */
export interface LpSnapshotStore {
  corporationId: number;
  systemIds: number[];
  offers: LpSnapshotOffer[];
}

export interface NearestStation {
  systemId: number;
  jumps: number;
}

/** The station system with the fewest jumps; null when none is reachable or distances are not known yet. */
export function nearestStation(
  systemIds: readonly number[],
  jumps: ReadonlyMap<number, number> | null
): NearestStation | null {
  if (jumps === null) return null;
  let best: NearestStation | null = null;
  for (const systemId of systemIds) {
    const count = jumps.get(systemId);
    if (count !== undefined && (best === null || count < best.jumps)) {
      best = { systemId, jumps: count };
    }
  }
  return best;
}

export interface ItemSearchStore {
  corporationId: number;
  corporationName: string;
  offer: LoyaltyStoreOffer;
  nearestSystemId: number | null;
  jumps: number | null;
}

export interface ItemSearchGroup {
  typeId: number;
  name: string;
  /** Nearest first; unplaceable stores last. */
  stores: ItemSearchStore[];
}

export interface CorporationSearchHit {
  corporationId: number;
  corporationName: string;
  nearestSystemId: number | null;
  jumps: number | null;
}

export interface LpSearchResult {
  groups: ItemSearchGroup[];
  corporations: CorporationSearchHit[];
  /** Items that matched before `groupLimit` cut the list. */
  totalItemMatches: number;
}

export interface LpSearchInputs {
  stores: readonly LpSnapshotStore[];
  /** Every NPC corporation with an LP Store (the baked list), whether or not the snapshot has it. */
  corporationNames: ReadonlyMap<number, string>;
  itemNames: ReadonlyMap<number, string>;
  query: string;
  /** Jumps from the Current System; null while unresolved. */
  jumps: ReadonlyMap<number, number> | null;
  /** How many item groups to return (the best-ranked matches). */
  groupLimit?: number;
}

export const DEFAULT_GROUP_LIMIT = 12;

export function toStoreOffer(offer: LpSnapshotOffer): LoyaltyStoreOffer {
  const [offer_id, type_id, quantity, isk_cost, lp_cost, required] = offer;
  return {
    offer_id,
    type_id,
    quantity,
    isk_cost,
    lp_cost,
    required_items: required.map(([requiredType, requiredQuantity]) => ({
      type_id: requiredType,
      quantity: requiredQuantity,
    })),
  };
}

/** Jumps ascending, null last, then name. */
function byDistanceThenName(
  a: { jumps: number | null; name: string },
  b: { jumps: number | null; name: string }
): number {
  if (a.jumps !== b.jumps) {
    if (a.jumps === null) return 1;
    if (b.jumps === null) return -1;
    return a.jumps - b.jumps;
  }
  return a.name.localeCompare(b.name);
}

export function searchLpStores(inputs: LpSearchInputs): LpSearchResult {
  const { stores, corporationNames, itemNames, query, jumps } = inputs;
  const groupLimit = inputs.groupLimit ?? DEFAULT_GROUP_LIMIT;
  if (query.trim() === '') return { groups: [], corporations: [], totalItemMatches: 0 };

  const placed = new Map<number, NearestStation | null>();
  for (const store of stores) {
    placed.set(store.corporationId, nearestStation(store.systemIds, jumps));
  }
  const nameOf = (corporationId: number) =>
    corporationNames.get(corporationId) ?? `#${corporationId}`;

  const typeIds = new Set<number>();
  for (const store of stores) for (const offer of store.offers) typeIds.add(offer[1]);
  const items = [...typeIds].flatMap((typeId) => {
    const name = itemNames.get(typeId);
    return name === undefined ? [] : [{ typeId, name }];
  });
  const matchedItems = rankedSearch(items, query, {
    primary: (item) => item.name,
    limit: items.length,
  });
  const shownItems = matchedItems.slice(0, groupLimit);

  const wanted = new Set(shownItems.map((item) => item.typeId));
  const byType = new Map<number, ItemSearchStore[]>();
  for (const store of stores) {
    for (const offer of store.offers) {
      if (!wanted.has(offer[1])) continue;
      const nearest = placed.get(store.corporationId) ?? null;
      const row: ItemSearchStore = {
        corporationId: store.corporationId,
        corporationName: nameOf(store.corporationId),
        offer: toStoreOffer(offer),
        nearestSystemId: nearest?.systemId ?? null,
        jumps: nearest?.jumps ?? null,
      };
      const list = byType.get(offer[1]);
      if (list) list.push(row);
      else byType.set(offer[1], [row]);
    }
  }
  const groups = shownItems.map((item) => ({
    typeId: item.typeId,
    name: item.name,
    stores: (byType.get(item.typeId) ?? []).sort((a, b) =>
      byDistanceThenName(
        { jumps: a.jumps, name: a.corporationName },
        { jumps: b.jumps, name: b.corporationName }
      )
    ),
  }));

  const matchedCorporations = rankedSearch(
    [...corporationNames].map(([corporationId, name]) => ({ corporationId, name })),
    query,
    { primary: (corp) => corp.name, limit: corporationNames.size }
  );
  const corporations = matchedCorporations
    .map(({ corporationId, name }) => ({
      corporationId,
      corporationName: name,
      nearestSystemId: placed.get(corporationId)?.systemId ?? null,
      jumps: placed.get(corporationId)?.jumps ?? null,
    }))
    .sort((a, b) =>
      byDistanceThenName(
        { jumps: a.jumps, name: a.corporationName },
        { jumps: b.jumps, name: b.corporationName }
      )
    );

  return { groups, corporations, totalItemMatches: matchedItems.length };
}

/** What the store view reads from the location state to draw its crumb back to the search. */
export interface LpSearchCrumbState {
  from: 'lp-search';
  q: string;
}

export function lpStorePath(corporationId: number, offerId?: number): string {
  const base = `/market/lp-store/${corporationId}`;
  return offerId === undefined ? base : `${base}?offer=${offerId}`;
}
