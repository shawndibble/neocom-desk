/**
 * Loads `BlueprintSourceSets` for the market-wide scan: which blueprints the
 * account owns, which are on the NPC market, which are on public contract,
 * which an LP store the account holds points with sells, and which the
 * account can invent from a T1 original it owns. The scan drops any product
 * whose blueprint none of these carry.
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
import { bpcOfferRows } from '@/features/bpcContracts/bpcOfferRows';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import { loadVariations } from '@/sde/loadMarketSde';
import { loadInvention } from '@/sde/loadSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import { loadCharacterBlueprints } from './data';

export interface LoadedBlueprintSources {
  sets: BlueprintSourceSets;
  /** Sources that could not be read, in whole or for some Character. */
  unavailable: BlueprintSource[];
}

type SourceResult = { ids: Set<number>; ok: boolean };

const FAILED: SourceResult = { ids: new Set(), ok: false };

/** Owned blueprints, plus which of them are originals (invention's copy job needs one). */
type OwnedResult = SourceResult & { originals: Set<number> };

async function ownedBlueprints(characterIds: readonly number[]): Promise<OwnedResult> {
  const results = await Promise.all(characterIds.map((id) => loadCharacterBlueprints(id)));
  const ids = new Set<number>();
  const originals = new Set<number>();
  let ok = true;
  for (const result of results) {
    if (!result.cached) ok = false;
    for (const blueprint of result.cached?.data ?? []) {
      ids.add(blueprint.type_id);
      if (blueprint.runs === -1) originals.add(blueprint.type_id);
    }
  }
  return { ids, originals, ok };
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
 * The snapshot is shared, not per-Character, and public in R2 (issue #4270),
 * so it is read once. A snapshot the backend has never synced lists nothing
 * and counts as unread.
 */
async function contractBlueprints(): Promise<SourceResult> {
  const snapshot = await loadPublicBpcContracts().catch(() => null);
  if (!snapshot || snapshot.data.lastSyncedAt === null) return FAILED;
  return { ids: new Set(bpcOfferRows(snapshot.data).map((row) => row.typeId)), ok: true };
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

/** The blueprints in `blueprints` invented from one of `originals` (`invention.json`). */
async function inventionBlueprints(
  blueprints: readonly BlueprintProduct[],
  originals: ReadonlySet<number>
): Promise<SourceResult> {
  if (originals.size === 0) return { ids: new Set(), ok: true };
  const data = await loadInvention();
  const inventable = new Set<number>();
  for (const [t1, research] of Object.entries(data.blueprints)) {
    if (!originals.has(Number(t1))) continue;
    for (const product of research.invention?.products ?? []) inventable.add(product.typeID);
  }
  const ids = new Set(blueprints.map((b) => b.blueprintTypeID).filter((id) => inventable.has(id)));
  return { ids, ok: true };
}

function settle<T extends SourceResult>(load: Promise<T>, failed: T): Promise<T> {
  return load.catch(() => failed);
}

/**
 * Reads every source for the account's Characters. `blueprints` bounds the
 * market lookup to the blueprints the scan could rank at all.
 */
export async function loadBlueprintSourceSets(
  characterIds: readonly number[],
  blueprints: readonly BlueprintProduct[]
): Promise<LoadedBlueprintSources> {
  const owning = settle(ownedBlueprints(characterIds), { ...FAILED, originals: new Set<number>() });
  const [owned, market, contract, lpStore, invention] = await Promise.all([
    owning,
    settle(marketBlueprints(blueprints), FAILED),
    settle(contractBlueprints(), FAILED),
    settle(lpStoreBlueprints(characterIds), FAILED),
    owning.then((result) => settle(inventionBlueprints(blueprints, result.originals), FAILED)),
  ]);
  // Unread owned blueprints leave invention unknown too, not empty.
  const bySource = {
    owned,
    market,
    contract,
    lpStore,
    invention: { ...invention, ok: invention.ok && owned.ok },
  };
  return {
    sets: {
      owned: owned.ids,
      market: market.ids,
      contract: contract.ids,
      lpStore: lpStore.ids,
      invention: invention.ids,
    },
    unavailable: (Object.keys(bySource) as BlueprintSource[]).filter(
      (source) => !bySource[source].ok
    ),
  };
}
