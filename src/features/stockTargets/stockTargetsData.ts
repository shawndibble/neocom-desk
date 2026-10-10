/**
 * The impure half of a **Stock List**'s rows: every Character's assets and own
 * sell orders, item names and hub prices, read and handed to the pure
 * `engine/stockTargets` functions. Cache-first through the same loaders Build
 * Plan owned-stock detection uses, so opening the tab rarely costs an ESI call.
 */
import { detectOwnedStock, type OwnedStockPlacement } from '@/engine/industry/ownedStock';
import { countOnHand, type OnHandCount } from '@/engine/stockTargets/onHand';
import { buildStockRows, type StockRow } from '@/engine/stockTargets/stockRows';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { loadAllCharactersAssets } from '@/features/character/assets';
import { loadTypeNames } from '@/features/character/typeNames';
import { resolveStockLocationNames } from '@/features/industry/ownedStockDetection';
import { loadAllCharactersOpenOrders } from '@/features/market/openOrdersData';
import type { TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';

export interface StockTargetsData {
  rows: StockRow[];
  names: Map<number, string>;
  counts: Map<number, OnHandCount>;
  /** Characters whose assets or orders could not all be read: every count is then a floor. */
  incompleteCharacters: string[];
  /** The oldest asset read behind the counts, or null when none was read. */
  oldestFetchedAt: Date | null;
  /** Every place the list's items sit or are listed, named, for the "Count at" picker. */
  locations: { id: number; name: string }[];
}

/** NPC stations sit in this id range; anything above is a player structure. */
const MAX_NPC_STATION_ID = 100_000_000;

export async function loadStockTargetsData(
  list: StockList,
  hub: TradeHub
): Promise<StockTargetsData> {
  const typeIds = list.items.map((item) => item.typeId);
  const [assets, orders, names, prices] = await Promise.all([
    loadAllCharactersAssets(),
    loadAllCharactersOpenOrders(),
    loadTypeNames(typeIds),
    getHubPrices(hub, typeIds).catch(() => new Map<number, { sellMin: number | null }>()),
  ]);

  const detected = detectOwnedStock(
    assets.entries.map((entry) => ({ characterId: entry.characterId, assets: entry.assets })),
    new Set(typeIds)
  );
  const sellOrders = orders.entries.flatMap((entry) =>
    entry.orders.map((order) => ({ ...order, characterId: entry.characterId }))
  );
  const counts = countOnHand(detected, sellOrders, list.locationId, typeIds);

  const rows = buildStockRows(
    list.items.map((item) => ({
      typeId: item.typeId,
      target: item.target,
      onHand: counts.get(item.typeId)?.total ?? 0,
      price: prices.get(item.typeId)?.sellMin ?? null,
    }))
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
  const oldestFetchedAt = fetchTimes.length > 0 ? new Date(Math.min(...fetchTimes)) : null;

  const typeSet = new Set(typeIds);
  const placements: OwnedStockPlacement[] = [
    ...[...detected.values()].flatMap((stock) => stock.placements),
    ...sellOrders
      .filter((order) => !order.is_buy_order && typeSet.has(order.type_id))
      .map((order) => ({
        characterId: order.characterId,
        locationId: order.location_id,
        locationType:
          order.location_id < MAX_NPC_STATION_ID ? ('station' as const) : ('item' as const),
        quantity: order.volume_remain,
      })),
  ];
  const locationNames = await resolveStockLocationNames(placements).catch(
    () => new Map<number, string>()
  );
  const locationIds = new Set(placements.map((placement) => placement.locationId));
  if (list.locationId !== null) locationIds.add(list.locationId);
  const locations = [...locationIds]
    .map((id) => ({ id, name: locationNames.get(id) ?? String(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { rows, names, counts, incompleteCharacters, oldestFetchedAt, locations };
}
