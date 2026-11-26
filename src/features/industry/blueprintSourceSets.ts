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
  unavailable: BlueprintSource[];
}

type SourceResult = { ids: Set<number>; ok: boolean };

const FAILED: SourceResult = { ids: new Set(), ok: false };

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

export interface BlueprintProduct {
  blueprintTypeID: number;
  productTypeID: number;
}

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

async function contractBlueprints(): Promise<SourceResult> {
  const snapshot = await loadPublicBpcContracts().catch(() => null);
  if (!snapshot || snapshot.data.lastSyncedAt === null) return FAILED;
  return { ids: new Set(bpcOfferRows(snapshot.data).map((row) => row.typeId)), ok: true };
}

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
