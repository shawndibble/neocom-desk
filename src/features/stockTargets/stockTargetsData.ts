/**
 * The impure half of the Stock tab: every Character's assets and own sell
 * orders, item names and hub prices, read and handed to the pure
 * `engine/stockTargets` functions. Cache-first through the same loaders Build
 * Plan owned-stock detection uses, so opening the tab rarely costs an ESI call.
 */
import { detectOwnedStock, type DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { rankMarkets, type MarketSummary } from '@/engine/stockTargets/markets';
import { countAtMarket, listedAtMarket } from '@/engine/stockTargets/onHand';
import type { StockAlertEntry } from '@/engine/stockTargets/stockAlert';
import { buildStockRows, summarizeStock, type StockRow } from '@/engine/stockTargets/stockRows';
import type { StockList, StockTarget } from '@/engine/stockTargets/stockLists';
import { db } from '@/db';
import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
import type { CharacterAsset, MarketOrder } from '@/esi/endpoints';
import { readCachedRows } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { KEY as ASSETS_KEY, loadAllCharactersAssets } from '@/features/assets/assets';
import { KEYS as ORDER_KEYS } from '@/features/character/orders';
import { loadStationSummary } from '@/features/character/stations';
import { loadStructureSummary } from '@/features/character/structures';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadAllCharactersOpenOrders } from '@/features/market/openOrdersData';
import type { TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { rootOf } from '@/features/market/marketTree';
import { loadMarketGroups } from '@/sde/loadMarketSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';

/** NPC stations sit in this id range; anything above is a player structure. */
const MAX_NPC_STATION_ID = 100_000_000;

type SellOrder = MarketOrder & { characterId: number };

interface Holdings {
  detected: DetectedOwnedStockMap;
  sellOrders: SellOrder[];
  /** Characters whose assets or orders could not all be read: every count is then a floor. */
  incompleteCharacters: string[];
  /** The oldest asset read behind the counts, or null when none was read. */
  oldestFetchedAt: Date | null;
  characterIds: number[];
}

/** `'all'` places every type the pilot holds, for "where are my things" rather than "where is this item". */
async function readHoldings(typeIds: readonly number[] | 'all'): Promise<Holdings> {
  const [assets, orders] = await Promise.all([
    loadAllCharactersAssets(),
    loadAllCharactersOpenOrders(),
  ]);
  const wanted =
    typeIds === 'all'
      ? new Set(assets.entries.flatMap((entry) => entry.assets.map((asset) => asset.type_id)))
      : new Set(typeIds);
  const detected = detectOwnedStock(
    assets.entries.map((entry) => ({ characterId: entry.characterId, assets: entry.assets })),
    wanted
  );
  const sellOrders = orders.entries.flatMap((entry) =>
    entry.orders
      .filter((order) => !order.is_buy_order)
      .map((order) => ({ ...order, characterId: entry.characterId }))
  );
  const incompleteCharacters = [
    ...new Set([
      ...assets.entries.filter((entry) => entry.truncated).map((entry) => entry.name),
      ...assets.skipped.map((character) => character.name),
      ...orders.entries.filter((entry) => entry.needsReauth).map((entry) => entry.characterName),
      ...orders.skipped.map((character) => character.name),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const fetchTimes = assets.entries
    .map((entry) => entry.fetchedAt?.getTime())
    .filter((time): time is number => time !== undefined);
  return {
    detected,
    sellOrders,
    incompleteCharacters,
    oldestFetchedAt: fetchTimes.length > 0 ? new Date(Math.min(...fetchTimes)) : null,
    characterIds: assets.entries.map((entry) => entry.characterId),
  };
}

export interface MarketPlace {
  name: string;
  kind: 'station' | 'structure';
  systemName: string | null;
  security: number | null;
}

/**
 * A market's station or structure, named, with its system. A structure is
 * read as the Characters most likely to be allowed in: those selling there.
 */
export async function loadMarketPlace(
  locationId: number,
  characterIds: readonly number[]
): Promise<MarketPlace | null> {
  let summary: { name: string; systemId: number } | null = null;
  let kind: MarketPlace['kind'] = 'station';
  if (locationId < MAX_NPC_STATION_ID) {
    summary = await loadStationSummary(locationId).catch(() => null);
  } else {
    kind = 'structure';
    for (const characterId of characterIds) {
      summary = await loadStructureSummary(characterId, locationId).catch(() => null);
      if (summary) break;
    }
  }
  if (!summary) return null;
  const system = await loadSystemNameAndSecurity(summary.systemId).catch(() => null);
  return {
    name: summary.name,
    kind,
    systemName: system?.name ?? null,
    security: system?.security ?? null,
  };
}

/** Characters selling at a market first, then the rest: who to read a structure as. */
function readersFor(locationId: number, holdings: Holdings): number[] {
  const sellers = holdings.sellOrders
    .filter((order) => order.location_id === locationId)
    .map((order) => order.characterId);
  return [...new Set([...sellers, ...holdings.characterIds])];
}

function rowsFor(
  list: StockList,
  holdings: Holdings,
  prices: ReadonlyMap<number, { sellMin: number | null }>
): StockRow[] {
  const counts = countAtMarket(
    holdings.detected,
    holdings.sellOrders,
    list.locationId,
    list.items.map((item) => item.typeId)
  );
  return buildStockRows(
    list.items.map((item) => ({
      typeId: item.typeId,
      target: item.target,
      listed: counts.get(item.typeId)?.listed ?? 0,
      inHangar: counts.get(item.typeId)?.inHangar ?? 0,
      price: prices.get(item.typeId)?.sellMin ?? null,
    }))
  );
}

const noPrices = () => new Map<number, { sellMin: number | null }>();

export interface StockTargetsData {
  rows: StockRow[];
  names: Map<number, string>;
  incompleteCharacters: string[];
  oldestFetchedAt: Date | null;
  /** Each item's top-level Market Group ("Ships", "Ammunition & Charges"), when the catalogue has it. */
  groups: Map<number, string>;
  place: MarketPlace | null;
}

export async function loadStockTargetsData(
  list: StockList,
  hub: TradeHub
): Promise<StockTargetsData> {
  const typeIds = list.items.map((item) => item.typeId);
  const [holdings, names, prices, groups] = await Promise.all([
    readHoldings(typeIds),
    loadTypeNames(typeIds),
    getHubPrices(hub, typeIds).catch(noPrices),
    loadRootGroupNames(typeIds).catch(() => new Map<number, string>()),
  ]);
  const place = await loadMarketPlace(list.locationId, readersFor(list.locationId, holdings));
  return {
    rows: rowsFor(list, holdings, prices),
    names,
    incompleteCharacters: holdings.incompleteCharacters,
    oldestFetchedAt: holdings.oldestFetchedAt,
    groups,
    place,
  };
}

export interface StockMarketRow extends MarketSummary {
  name: string;
  place: MarketPlace | null;
  unpricedShort: number;
}

export interface StockMarketsData {
  /** Worst first. */
  markets: StockMarketRow[];
  incompleteCharacters: string[];
  oldestFetchedAt: Date | null;
}

/** Every market at once, for the Stock tab's landing list. */
export async function loadStockMarkets(
  lists: readonly StockList[],
  hub: TradeHub
): Promise<StockMarketsData> {
  const typeIds = [...new Set(lists.flatMap((list) => list.items.map((item) => item.typeId)))];
  const [holdings, prices] = await Promise.all([
    readHoldings(typeIds),
    getHubPrices(hub, typeIds).catch(noPrices),
  ]);
  const markets = await Promise.all(
    lists.map(async (list): Promise<StockMarketRow> => {
      const summary = summarizeStock(rowsFor(list, holdings, prices));
      return {
        listId: list.id,
        name: list.name,
        items: list.items.length,
        out: summary.out,
        low: summary.low,
        readyToList: summary.readyToList,
        costToFill: summary.costToFill,
        unpricedShort: summary.unpricedShort,
        place: await loadMarketPlace(list.locationId, readersFor(list.locationId, holdings)),
      };
    })
  );
  return {
    markets: rankMarkets(markets),
    incompleteCharacters: holdings.incompleteCharacters,
    oldestFetchedAt: holdings.oldestFetchedAt,
  };
}

export interface SellLocation {
  locationId: number;
  name: string;
  kind: MarketPlace['kind'];
  /** Zero for a structure the pilot only keeps items at. */
  orderCount: number;
}

/**
 * The New market dialog's suggestions: every station and structure the pilot
 * has sell orders at, most orders first, then the structures they keep items
 * at. A structure is otherwise found only by ESI's name search; an NPC station
 * is always searchable from the snapshot, so stations with items alone are not
 * suggested.
 */
export async function loadSellLocations(): Promise<SellLocation[]> {
  const holdings = await readHoldings('all');
  const counts = new Map<number, number>();
  for (const order of holdings.sellOrders) {
    counts.set(order.location_id, (counts.get(order.location_id) ?? 0) + 1);
  }
  for (const stock of holdings.detected.values()) {
    for (const placement of stock.placements) {
      if (placement.locationId >= MAX_NPC_STATION_ID && !counts.has(placement.locationId)) {
        counts.set(placement.locationId, 0);
      }
    }
  }
  const locations = await Promise.all(
    [...counts].map(async ([locationId, orderCount]) => {
      const place = await loadMarketPlace(locationId, readersFor(locationId, holdings));
      return {
        locationId,
        orderCount,
        name: place?.name ?? String(locationId),
        kind: place?.kind ?? (locationId < MAX_NPC_STATION_ID ? 'station' : 'structure'),
      };
    })
  );
  return locations.sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name));
}

/** What the pilot sells at a market now, as starting Stock Targets. */
export async function loadListedAtMarket(locationId: number): Promise<StockTarget[]> {
  const holdings = await readHoldings([]);
  return listedAtMarket(holdings.sellOrders, locationId);
}

/** Each type's top-level Market Group name, from the bundled market catalogue. */
async function loadRootGroupNames(typeIds: readonly number[]): Promise<Map<number, string>> {
  const [types, groupList] = await Promise.all([loadMarketTypesById(), loadMarketGroups()]);
  const groupsById = new Map(groupList.map((group) => [group.id, group]));
  const result = new Map<number, string>();
  for (const typeId of typeIds) {
    const groupId = types.get(typeId)?.marketGroupId;
    if (groupId === undefined) continue;
    const root = groupsById.get(rootOf(groupId, groupsById));
    if (root) result.set(typeId, root.name);
  }
  return result;
}

/**
 * The below-target alert's reading: every Stock Target on every market's list
 * against the **cached** assets and orders of every Character. Cache only —
 * this runs inside the foreground poll, where a live read would fan an asset
 * request out per Character on every poll; the caches refresh on their own.
 */
export async function loadStockAlertEntries(
  lists: readonly StockList[]
): Promise<StockAlertEntry[]> {
  const items = lists.flatMap((list) => list.items);
  if (items.length === 0) return [];
  const characterIds = (await db.characters.toArray()).map((c) => c.characterId);
  const typeIds = [...new Set(items.map((item) => item.typeId))];
  const [assets, orders, names] = await Promise.all([
    readCachedRows<CharacterAsset[]>(characterIds, ASSETS_KEY),
    readCachedRows<MarketOrder[]>(characterIds, ORDER_KEYS.open),
    loadTypeNames(typeIds),
  ]);
  // Listed counts come from the order cache. Every Character that can sell must have one:
  // a missing cache would read their listings as gone and fire a false Out.
  const orderScope = ESI_REGISTRY.getCharacterOrders.scope;
  const sellers = await characterIdsWithScopes([orderScope]);
  const known = sellers.length > 0 && sellers.every((id) => orders.has(id));
  const detected = detectOwnedStock(
    [...assets].map(([characterId, cached]) => ({ characterId, assets: cached.data })),
    new Set(typeIds)
  );
  const sellOrders = [...orders.values()].flatMap((cached) => cached.data);
  return lists.flatMap((list) => {
    const counts = countAtMarket(
      detected,
      sellOrders,
      list.locationId,
      list.items.map((item) => item.typeId)
    );
    return list.items.map((item) => ({
      listId: list.id,
      listName: list.name,
      locationId: list.locationId,
      typeId: item.typeId,
      name: names.get(item.typeId) ?? `#${item.typeId}`,
      target: item.target,
      listed: known ? (counts.get(item.typeId)?.listed ?? 0) : null,
      inHangar: counts.get(item.typeId)?.inHangar ?? 0,
    }));
  });
}
