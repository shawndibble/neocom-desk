/**
 * Corporation as a data source of Market's Open orders. The corp read
 * (`loadCorpOrdersFeed`) is mapped into the same page snapshot the Character
 * read yields, so the panel draws it unchanged: one entry per issuer where the
 * Character view has one per Character, so the Character column names who
 * placed each order. What the corporation has none of (cost basis, skills,
 * standings, order history) stays empty, and the panel shows what it shows for
 * any missing value. Undercut and relist advice rest on market prices alone, so
 * they work the same.
 */
import { buildOpenOrderRows, type OpenOrderRow } from './openOrdersModel';
import type { CharacterOpenOrders } from './openOrdersData';
import type { OpenOrdersPageSnapshot } from './openOrdersPageSnapshot';
import type { MarketOrder } from '@/esi/endpoints';
import {
  loadCorpOrdersFeed,
  type CorpOrdersFeed,
} from '@/features/overview/widgets/data/corpFeeds';

/** The Character page snapshot's shape, fed from the corporation's orders. */
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
    // The corp read keeps names only; the station's system is not needed here.
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

/** The corporation's open orders as Open orders rows, judged by the Character undercut rules. */
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

/**
 * The page's read for the Corporation source: gated on corp access inside the
 * feed. A feed that is neither readable nor a lapsed grant is a failed read.
 */
export async function loadCorpOpenOrdersSnapshot(
  characterId: number
): Promise<OpenOrdersPageSnapshot> {
  const feed = await loadCorpOrdersFeed(characterId);
  if (!feed.readable && !feed.needsReauth) throw new Error('Corporation orders are not readable');
  return corpOrdersSnapshot(feed, Date.now());
}
