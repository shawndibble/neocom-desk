import { detectOwnedStock, type DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import { jobsAtMarket, type StockJobInput } from '@/engine/stockTargets/inJobs';
import { contractStockAtMarket, type ContractStockInput } from '@/engine/stockTargets/onContract';
import { rankMarkets, type MarketSummary } from '@/engine/stockTargets/markets';
import {
  countAtMarket,
  biggestFirst,
  holdersAtMarket,
  type HolderCount,
  listedAtMarket,
  sellersAtMarket,
  totalOf,
} from '@/engine/stockTargets/onHand';
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
import { readCachedContractStock } from './cachedContractStock';
import { readCachedStockJobs, readStockJobs } from './stockJobs';
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

const MAX_NPC_STATION_ID = 100_000_000;

type SellOrder = MarketOrder & { characterId: number };

interface Holdings {
  detected: DetectedOwnedStockMap;
  sellOrders: SellOrder[];
  contractStock: ContractStockInput[];
  jobs: StockJobInput[];
  incompleteCharacters: string[];
  oldestFetchedAt: Date | null;
  characterIds: number[];
  characterNames: Map<number, string>;
}

async function readHoldings(typeIds: readonly number[] | 'all'): Promise<Holdings> {
  const [assets, orders] = await Promise.all([
    loadAllCharactersAssets(),
    loadAllCharactersOpenOrders(),
  ]);
  const jobsRead =
    typeIds === 'all' || typeIds.length === 0
      ? { jobs: [] as StockJobInput[], oldestFetchedAt: null }
      : await readStockJobs();
  const wanted =
    typeIds === 'all'
      ? new Set(assets.entries.flatMap((entry) => entry.assets.map((asset) => asset.type_id)))
      : new Set(typeIds);
  const detected = detectOwnedStock(
    assets.entries.map((entry) => ({ characterId: entry.characterId, assets: entry.assets })),
    wanted
  );
  const contractStock = await readCachedContractStock([
    ...assets.entries.map((entry) => entry.characterId),
  ]);
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
  const characterNames = new Map<number, string>([
    ...assets.entries.map((entry): [number, string] => [entry.characterId, entry.name]),
    ...orders.entries.map((entry): [number, string] => [entry.characterId, entry.characterName]),
  ]);
  const fetchTimes = [
    ...assets.entries.map((entry) => entry.fetchedAt?.getTime()),
    jobsRead.oldestFetchedAt?.getTime(),
  ].filter((time): time is number => time !== undefined);
  return {
    detected,
    sellOrders,
    contractStock,
    jobs: jobsRead.jobs,
    incompleteCharacters,
    oldestFetchedAt: fetchTimes.length > 0 ? new Date(Math.min(...fetchTimes)) : null,
    characterIds: assets.entries.map((entry) => entry.characterId),
    characterNames,
  };
}

export interface MarketPlace {
  name: string;
  kind: 'station' | 'structure';
  systemName: string | null;
  security: number | null;
}

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

function readersFor(locationId: number, holdings: Holdings): number[] {
  const sellers = holdings.sellOrders
    .filter((order) => order.location_id === locationId)
    .map((order) => order.characterId);
  return [...new Set([...sellers, ...holdings.characterIds])];
}

function mergeHolders(
  orders: readonly HolderCount[],
  contracts: readonly HolderCount[]
): HolderCount[] {
  const shares = new Map<number, number>();
  for (const holder of [...orders, ...contracts]) {
    shares.set(holder.characterId, (shares.get(holder.characterId) ?? 0) + holder.quantity);
  }
  return biggestFirst(shares);
}

function rowsFor(
  list: StockList,
  holdings: Holdings,
  prices: ReadonlyMap<number, { sellMin: number | null }>
): StockRow[] {
  return buildListRows(list, holdings, prices).rows;
}

function buildListRows(
  list: StockList,
  holdings: Holdings,
  prices: ReadonlyMap<number, { sellMin: number | null }>
): { rows: StockRow[]; jobsElsewhere: number } {
  const typeIds = list.items.map((item) => item.typeId);
  const counts = countAtMarket(holdings.detected, holdings.sellOrders, list.locationId, typeIds);
  const holders = holdersAtMarket(holdings.detected, holdings.sellOrders, list.locationId, typeIds);
  const contracts = contractStockAtMarket(
    holdings.contractStock,
    list.locationId,
    typeIds,
    Date.now()
  );
  const inJobs = jobsAtMarket(holdings.jobs, list.locationId, typeIds);
  const rows = buildStockRows(
    list.items.map((item) => {
      const onContractBy = contracts.get(item.typeId) ?? [];
      const onContract = totalOf(onContractBy);
      return {
        typeId: item.typeId,
        target: item.target,
        listed: (counts.get(item.typeId)?.listed ?? 0) + onContract,
        onContract,
        inHangar: counts.get(item.typeId)?.inHangar ?? 0,
        price: prices.get(item.typeId)?.sellMin ?? null,
        listedBy: mergeHolders(holders.get(item.typeId)?.listedBy ?? [], onContractBy),
        inHangarBy: holders.get(item.typeId)?.inHangarBy,
        inJobs: inJobs.byType.get(item.typeId)?.units,
        nextJobEnd: inJobs.byType.get(item.typeId)?.earliestEnd,
      };
    })
  );
  return { rows, jobsElsewhere: inJobs.elsewhere };
}

const noPrices = () => new Map<number, { sellMin: number | null }>();

export interface StockTargetsData {
  rows: StockRow[];
  names: Map<number, string>;
  incompleteCharacters: string[];
  oldestFetchedAt: Date | null;
  groups: Map<number, string>;
  place: MarketPlace | null;
  characterNames: Map<number, string>;
  sellers: number[];
  jobsElsewhere: number;
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
  const { rows, jobsElsewhere } = buildListRows(list, holdings, prices);
  return {
    rows,
    jobsElsewhere,
    names,
    incompleteCharacters: holdings.incompleteCharacters,
    oldestFetchedAt: holdings.oldestFetchedAt,
    groups,
    place,
    characterNames: holdings.characterNames,
    sellers: sellersAtMarket(holdings.sellOrders, list.locationId),
  };
}

export interface StockMarketRow extends MarketSummary {
  name: string;
  place: MarketPlace | null;
  unpricedShort: number;
}

export interface StockMarketsData {
  markets: StockMarketRow[];
  incompleteCharacters: string[];
  oldestFetchedAt: Date | null;
}

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
  orderCount: number;
}

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

export async function loadListedAtMarket(locationId: number): Promise<StockTarget[]> {
  const holdings = await readHoldings([]);
  return listedAtMarket(holdings.sellOrders, locationId);
}

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
  const orderScope = ESI_REGISTRY.getCharacterOrders.scope;
  const sellers = await characterIdsWithScopes([orderScope]);
  const known = sellers.length > 0 && sellers.every((id) => orders.has(id));
  const detected = detectOwnedStock(
    [...assets].map(([characterId, cached]) => ({ characterId, assets: cached.data })),
    new Set(typeIds)
  );
  const sellOrders = [...orders.values()].flatMap((cached) => cached.data);
  const contractStock = await readCachedContractStock(characterIds);
  const { jobs } = await readCachedStockJobs(characterIds);
  const now = Date.now();
  return lists.flatMap((list) => {
    const inJobs = jobsAtMarket(
      jobs,
      list.locationId,
      list.items.map((item) => item.typeId)
    ).byType;
    const contracts = contractStockAtMarket(
      contractStock,
      list.locationId,
      list.items.map((item) => item.typeId),
      now
    );
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
      listed: known
        ? (counts.get(item.typeId)?.listed ?? 0) + totalOf(contracts.get(item.typeId) ?? [])
        : null,
      inHangar: counts.get(item.typeId)?.inHangar ?? 0,
      inJobs: inJobs.get(item.typeId)?.units ?? 0,
    }));
  });
}
