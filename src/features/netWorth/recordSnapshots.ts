import { captureException } from '@sentry/react';
import { db } from '@/db';
import { STALE_AFTER } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { openIssuedItemContracts, type StockContractItem } from '@/engine/netWorth/contractStock';
import {
  buildSnapshotRow,
  lacksLayer,
  snapshotId,
  utcDay,
  type SnapshotInputs,
} from '@/engine/netWorth/snapshot';
import { lastKnownAbyssalValues } from '@/features/abyssal/abyssalEstimates';
import { loadCharacterAssets } from '@/features/assets/assets';
import { loadContracts } from '@/features/character/contracts';
import { loadContractItemsDetailed } from '@/features/character/contractItems';
import { loadOrders } from '@/features/character/orders';
import { loadWalletBalanceWithStatus } from '@/features/character/wallet';
import { tradeHubIdFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getAveragePriceByType, getHubPrices } from '@/market/prices';
import { scheduleSync } from '@/sync';
import { loadGrantedScopes } from '@/app/grantedScopes';

export const REQUIRED_SCOPES = [
  ESI_REGISTRY.getCharacterWallet.scope,
  ESI_REGISTRY.getCharacterAssets.scope,
  ESI_REGISTRY.getCharacterOrders.scope,
];

const MAX_CONTRACT_ITEM_READS = 30;

const GONE_STATUSES = [404, 410];

async function readContractStock(
  characterId: number,
  now: number
): Promise<SnapshotFetch['contractStock']> {
  const contracts = await loadContracts(characterId);
  if (contracts.needsReauth || !contracts.cached) return null;
  if (contracts.cached.truncated || isStale(contracts.cached)) return null;
  const open = openIssuedItemContracts(contracts.cached.data, characterId, now);
  const itemsByContractId = new Map<number, readonly StockContractItem[] | null>();
  let reads = 0;
  for (const contract of open) {
    if (reads >= MAX_CONTRACT_ITEM_READS) return null;
    const outcome = await loadContractItemsDetailed(characterId, contract.contract_id).catch(
      () => null
    );
    if (outcome?.networkRead) reads += 1;
    if (!outcome?.result) {
      if (!outcome || !GONE_STATUSES.includes(outcome.failureStatus ?? 0)) return null;
      itemsByContractId.set(contract.contract_id, null);
      continue;
    }
    itemsByContractId.set(contract.contract_id, outcome.result.data);
  }
  return { contracts: contracts.cached.data, itemsByContractId };
}

export type SnapshotFetch = Omit<SnapshotInputs, 'characterId' | 'now'>;

export interface SnapshotSources {
  fetch(characterId: number): Promise<SnapshotFetch | null>;
}

const writeChains = new Map<number, Promise<unknown>>();

function isStale(cached: { fromCache: boolean; fetchedAt: Date } | null): boolean {
  if (!cached) return false;
  return cached.fromCache || Date.now() - cached.fetchedAt.getTime() > STALE_AFTER.default;
}

export const liveSources: SnapshotSources = {
  async fetch(characterId) {
    const token = await db.tokens.get(characterId);
    const scopes = token?.scopes ?? [];
    if (!REQUIRED_SCOPES.every((scope) => scopes.includes(scope))) return null;
    const contractStock = scopes.includes(ESI_REGISTRY.getCharacterContracts.scope)
      ? await readContractStock(characterId, Date.now()).catch(() => null)
      : null;
    const [wallet, assets, orders] = await Promise.all([
      loadWalletBalanceWithStatus(characterId),
      loadCharacterAssets(characterId),
      loadOrders(characterId),
    ]);
    if (wallet.needsReauth || assets.needsReauth || orders.needsReauth) return null;
    if ([wallet, assets, orders].some((source) => isStale(source.cached))) return null;
    const hubId = await tradeHubIdFor(characterId);
    const assetList = assets.cached?.data ?? null;
    const abyssal = await lastKnownAbyssalValues(assetList ?? []);
    if (!abyssal) return null;
    const contractTypeIds = [...(contractStock?.itemsByContractId.values() ?? [])].flatMap(
      (items) => (items ?? []).map((line) => line.type_id)
    );
    const typeIds = [
      ...new Set([...(assetList ?? []).map((a) => a.type_id), ...contractTypeIds]),
    ].filter((id) => id !== PLEX_TYPE_ID && !abyssal.isAbyssalType(id));
    const [hubPrices, averages] = await Promise.all([
      getHubPrices(getTradeHub(hubId) ?? DEFAULT_TRADE_HUB, typeIds),
      getAveragePriceByType(),
    ]);
    const priceByTypeId = new Map<number, number>();
    for (const id of typeIds) {
      const price = hubPrices.get(id)?.sellMin ?? averages.get(id);
      if (price !== undefined && price !== null) priceByTypeId.set(id, price);
    }
    if (typeIds.length > 0 && priceByTypeId.size === 0) return null;
    return {
      hubId,
      wallet: wallet.cached?.data ?? null,
      assets: assetList,
      orders: orders.cached?.data ?? null,
      priceByTypeId,
      contractStock,
      itemValueByItemId: abyssal.values,
    };
  },
};

export type SnapshotOutcome = 'written' | 'upgraded' | 'already-recorded' | 'skipped';

async function recordOne(
  characterId: number,
  sources: SnapshotSources,
  now: number
): Promise<SnapshotOutcome> {
  const held = await db.netWorthSnapshots.get(snapshotId(characterId, utcDay(now)));
  if (held) {
    const scopes = await loadGrantedScopes(characterId);
    const contracts = scopes.has(ESI_REGISTRY.getCharacterContracts.scope);
    if (!lacksLayer(held, { contracts })) return 'already-recorded';
  }
  const fetched = await sources.fetch(characterId);
  if (!fetched) return 'skipped';
  const row = buildSnapshotRow({ ...fetched, characterId, now });
  if (!row) return 'skipped';
  await db.netWorthSnapshots.put(row);
  scheduleSync(characterId, { collections: ['netWorthSnapshots'] });
  return held ? 'upgraded' : 'written';
}

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

export async function recordAllNetWorthSnapshots(
  sources: SnapshotSources = liveSources,
  now: number = Date.now()
): Promise<void> {
  const characters = await db.characters.toArray();
  for (const { characterId } of characters) {
    await recordNetWorthSnapshot(characterId, sources, now);
  }
}
