import { buildOpenOrderRows, type OpenOrderRow } from './openOrdersModel';
import type { CharacterOpenOrders } from './openOrdersData';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';
import type { MarketOrder } from '@/esi/endpoints';
import {
  loadCorpOrdersFeed,
  type CorpOrdersFeed,
} from '@/features/overview/widgets/data/corpFeeds';

export function corpOrdersSnapshot(feed: CorpOrdersFeed, now: number): OpenOrdersPageSnapshot {
  const fetchedAt = feed.fetchedAt?.getTime() ?? 0;
  const byIssuer = new Map<number, MarketOrder[]>();
  for (const order of feed.orders) {
    const issuerId = order.issued_by ?? 0;
    const orders = byIssuer.get(issuerId) ?? [];
    orders.push({ ...order, is_corporation: true });
    byIssuer.set(issuerId, orders);
  }
  const entries: CharacterOpenOrders[] = [...byIssuer].map(([issuerId, orders]) => ({
    characterId: issuerId,
    characterName: feed.issuerNames.get(issuerId) ?? '',
    orders,
    fetchedAt,
    fromCache: feed.fromCache,
    needsReauth: false,
  }));
  return {
    openOrders: { entries, skipped: [] },
    typeNames: new Map(feed.typeNames),
    npcStations: new Map([...feed.stationNames].map(([id, name]) => [id, { name, systemId: 0 }])),
    stationsLoaded: feed.stationNames.size > 0,
    stationPrices: new Map(feed.stationPrices),
    costBases: new Map(),
    walletBasisGaps: new Map(),
    problemSamples: new Map(),
    skillsByCharacter: new Map(),
    standingsByOrder: new Map(),
    now,
    corporation: { needsReauth: feed.needsReauth },
  };
}

export function corpOrderRows(feed: CorpOrdersFeed, now: number): OpenOrderRow[] {
  const snapshot = corpOrdersSnapshot(feed, now);
  return buildOpenOrderRows({
    snapshot: snapshot.openOrders,
    typeNames: snapshot.typeNames,
    stationPrices: snapshot.stationPrices,
    costBases: snapshot.costBases,
    stationNames: new Map([...snapshot.npcStations].map(([id, s]) => [id, s.name])),
    skillsByCharacter: snapshot.skillsByCharacter,
    now,
  });
}

export async function loadCorpOpenOrdersSnapshot(
  characterId: number
): Promise<OpenOrdersPageSnapshot> {
  const feed = await loadCorpOrdersFeed(characterId);
  if (!feed.readable && !feed.needsReauth) throw new Error('Corporation orders are not readable');
  return corpOrdersSnapshot(feed, Date.now());
}

export async function loadCorpOrdersGrantSnapshot(): Promise<OpenOrdersPageSnapshot> {
  return corpOrdersSnapshot(
    {
      readable: false,
      needsReauth: true,
      fetchedAt: null,
      fromCache: false,
      orders: [],
      typeNames: new Map(),
      stationNames: new Map(),
      stationPrices: new Map(),
      issuerNames: new Map(),
    },
    Date.now()
  );
}
