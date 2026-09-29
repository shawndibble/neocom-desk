/**
 * Loads `BlueprintSourceSets` for the market-wide scan: which blueprints the
 * account owns, which are on the NPC market, which are on public contract,
 * and which an LP store the account holds points with sells. The scan drops
 * any product whose blueprint none of these carry.
 *
 * Every source is best-effort. One that can't be read (sync not configured,
 * a revoked scope, offline and uncached) contributes nothing and is named in
 * `unavailable`, so the panel can say its list may be missing rows rather
 * than implying they aren't profitable.
 */
import {
  isNpcSeededProduct,
  type BlueprintSource,
  type BlueprintSourceSets,
} from '@/engine/industry/blueprintObtainability';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import { loadVariations } from '@/sde/loadMarketSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import { loadCharacterBlueprints } from './data';

export interface LoadedBlueprintSources {
  sets: BlueprintSourceSets;
  /** Sources that could not be read, in whole or for some Character. */
  unavailable: BlueprintSource[];
}

type SourceResult = { ids: Set<number>; ok: boolean };

const FAILED: SourceResult = { ids: new Set(), ok: false };

async function ownedBlueprints(characterIds: readonly number[]): Promise<SourceResult> {
  const results = await Promise.all(characterIds.map((id) => loadCharacterBlueprints(id)));
  const ids = new Set<number>();
  let ok = true;
  for (const result of results) {
    if (!result.cached) ok = false;
    for (const blueprint of result.cached?.data ?? []) ids.add(blueprint.type_id);
  }
  return { ids, ok };
}

/** A blueprint and the product it builds. */
export interface BlueprintProduct {
  blueprintTypeID: number;
  productTypeID: number;
}

/**
 * NPC-seeded blueprint originals: market-grouped, and building a Tech I (or
 * Structure Tech I) product. Market-grouping alone lets through the T2
 * lottery BPOs and some faction blueprints, which CCP groups but no NPC sells.
 */
async function marketBlueprints(blueprints: readonly BlueprintProduct[]): Promise<SourceResult> {
  const [index, variations] = await Promise.all([loadMarketTypesById(), loadVariations()]);
  const ids = new Set<number>();
  for (const { blueprintTypeID, productTypeID } of blueprints) {
    if (!index.has(blueprintTypeID)) continue;
    if (!isNpcSeededProduct(variations.types[productTypeID]?.metaGroupId)) continue;
    ids.add(blueprintTypeID);
  }
  return { ids, ok: true };
}

/**
 * The snapshot is shared, not per-Character — any Character's Firebase
 * session can read it, so each is tried in turn until one does. A snapshot
 * the backend has never synced lists nothing and counts as unread.
 */
async function contractBlueprints(characterIds: readonly number[]): Promise<SourceResult> {
  if (!isSyncConfigured()) return FAILED;
  for (const characterId of characterIds) {
    const snapshot = await loadPublicBpcContracts(characterId).catch(() => null);
    if (!snapshot || snapshot.data.lastSyncedAt === null) continue;
    const { rows, originals = [] } = snapshot.data;
    return { ids: new Set([...rows, ...originals].map((row) => row.typeId)), ok: true };
  }
  return FAILED;
}

/**
 * ESI has no "who sells this type" search, so only corps some Character
 * holds points with are read — the same reach Appraisal's LP lookup has.
 */
async function lpStoreBlueprints(characterIds: readonly number[]): Promise<SourceResult> {
  if (characterIds.length === 0) return FAILED;
  const points = await Promise.all(characterIds.map((id) => loadCharacterLoyaltyPoints(id)));
  let ok = true;
  const corporationIds = new Set<number>();
  for (const result of points) {
    if (!result.cached) ok = false;
    for (const entry of result.cached?.data ?? []) {
      if (entry.corporation_id !== PARAGON_CORPORATION_ID && entry.loyalty_points > 0) {
        corporationIds.add(entry.corporation_id);
      }
    }
  }
  const offers = await Promise.all([...corporationIds].map((id) => loadLoyaltyStoreOffers(id)));
  const ids = new Set<number>();
  for (const result of offers) {
    if (!result) ok = false;
    for (const offer of result?.data ?? []) ids.add(offer.type_id);
  }
  return { ids, ok };
}

function settle(load: Promise<SourceResult>): Promise<SourceResult> {
  return load.catch(() => FAILED);
}

/**
 * Reads every source for the account's Characters. `blueprints` bounds the
 * market lookup to the blueprints the scan could rank at all.
 */
export async function loadBlueprintSourceSets(
  characterIds: readonly number[],
  blueprints: readonly BlueprintProduct[]
): Promise<LoadedBlueprintSources> {
  const [owned, market, contract, lpStore] = await Promise.all([
    settle(ownedBlueprints(characterIds)),
    settle(marketBlueprints(blueprints)),
    settle(contractBlueprints(characterIds)),
    settle(lpStoreBlueprints(characterIds)),
  ]);
  const bySource = { owned, market, contract, lpStore };
  return {
    sets: {
      owned: owned.ids,
      market: market.ids,
      contract: contract.ids,
      lpStore: lpStore.ids,
    },
    unavailable: (Object.keys(bySource) as BlueprintSource[]).filter(
      (source) => !bySource[source].ok
    ),
  };
}
