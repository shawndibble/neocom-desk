/**
 * Writes the daily Net Worth Snapshot (issue #2865) — the impure shell around
 * `engine/netWorth/snapshot.ts`. It reads the same cached wallet, assets and
 * orders fetches the pages use, so it adds no ESI calls of its own beyond a
 * cache refresh, and writes at most one row per Character per UTC day.
 */
import { captureException } from '@sentry/react';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import {
  buildSnapshotRow,
  snapshotId,
  utcDay,
  type SnapshotInputs,
} from '@/engine/netWorth/snapshot';
import { loadCharacterAssets } from '@/features/character/assets';
import { loadOrders } from '@/features/character/orders';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { MARKET_HUB_SETTING_KEY } from '@/features/market/hub';
import { loadPlexPrice } from '@/features/market/plexPrice';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getAveragePriceByType, getHubPrices } from '@/market/prices';
import { scheduleSync } from '@/sync';

const REQUIRED_SCOPES = [
  ESI_REGISTRY.getCharacterWallet.scope,
  ESI_REGISTRY.getCharacterAssets.scope,
  ESI_REGISTRY.getCharacterOrders.scope,
];

export type SnapshotFetch = Omit<SnapshotInputs, 'characterId' | 'now'>;

/** Where the snapshot's numbers come from; swapped in tests. */
export interface SnapshotSources {
  fetch(characterId: number): Promise<SnapshotFetch | null>;
}

/** Tail of each Character's write chain, so overlapping runs can't both pass the once-a-day check. */
const writeChains = new Map<number, Promise<unknown>>();

async function hubIdSetting(): Promise<string> {
  const stored = (await db.settings.get(MARKET_HUB_SETTING_KEY))?.value;
  return typeof stored === 'string' && getTradeHub(stored) ? stored : DEFAULT_TRADE_HUB.id;
}

export const liveSources: SnapshotSources = {
  async fetch(characterId) {
    const token = await db.tokens.get(characterId);
    const scopes = token?.scopes ?? [];
    // Checked up front so a missing permission never provokes a live 403.
    if (!REQUIRED_SCOPES.every((scope) => scopes.includes(scope))) return null;
    const [wallet, assets, orders] = await Promise.all([
      loadWalletBalanceWithStatus(characterId),
      loadCharacterAssets(characterId),
      loadOrders(characterId),
    ]);
    // A permission revoked since the grant check: the cached copy is not today's number.
    if (wallet.needsReauth || assets.needsReauth || orders.needsReauth) return null;
    const hubId = await hubIdSetting();
    const assetList = assets.cached?.data ?? null;
    const typeIds = [...new Set((assetList ?? []).map((a) => a.type_id))].filter(
      (id) => id !== PLEX_TYPE_ID
    );
    const [hubPrices, averages, plexPrice] = await Promise.all([
      getHubPrices(getTradeHub(hubId) ?? DEFAULT_TRADE_HUB, typeIds),
      getAveragePriceByType(),
      loadPlexPrice().catch(() => null),
    ]);
    // Hub sell price where the hub trades the item, the average otherwise.
    const priceByTypeId = new Map<number, number>();
    for (const id of typeIds) {
      const price = hubPrices.get(id)?.sellMin ?? averages.get(id);
      if (price !== undefined && price !== null) priceByTypeId.set(id, price);
    }
    // Both price sources down: a near-zero asset value would be frozen into the day.
    if (typeIds.length > 0 && priceByTypeId.size === 0) return null;
    return {
      hubId,
      wallet: wallet.cached?.data ?? null,
      assets: assetList,
      orders: orders.cached?.data ?? null,
      priceByTypeId,
      plexPrice,
    };
  },
};

export type SnapshotOutcome = 'written' | 'already-recorded' | 'skipped';

async function recordOne(
  characterId: number,
  sources: SnapshotSources,
  now: number
): Promise<SnapshotOutcome> {
  if (await db.netWorthSnapshots.get(snapshotId(characterId, utcDay(now)))) {
    return 'already-recorded';
  }
  const fetched = await sources.fetch(characterId);
  if (!fetched) return 'skipped';
  const row = buildSnapshotRow({ ...fetched, characterId, now });
  if (!row) return 'skipped';
  await db.netWorthSnapshots.put(row);
  scheduleSync(characterId);
  return 'written';
}

/** Record today's snapshot for one Character unless it already has one. Never throws: history is a bonus on top of the pages. */
export function recordNetWorthSnapshot(
  characterId: number,
  sources: SnapshotSources = liveSources,
  now: number = Date.now()
): Promise<SnapshotOutcome> {
  const next = (writeChains.get(characterId) ?? Promise.resolve()).then(
    () => recordOne(characterId, sources, now),
    () => recordOne(characterId, sources, now)
  );
  const safe = next.catch((error: unknown): SnapshotOutcome => {
    captureException(error);
    return 'skipped';
  });
  writeChains.set(characterId, safe);
  return safe;
}

/** Today's snapshot for every stored Character, one after another so the price and ESI reads don't pile up. */
export async function recordAllNetWorthSnapshots(
  sources: SnapshotSources = liveSources,
  now: number = Date.now()
): Promise<void> {
  const characters = await db.characters.toArray();
  for (const { characterId } of characters) {
    await recordNetWorthSnapshot(characterId, sources, now);
  }
}
