import {
  loadWithCache,
  readCached,
  GLOBAL_CACHE_CHARACTER_ID,
  type CachedResult,
} from '@/esi/cache';
import { loadR2BlueprintRows, loadR2OfferIndex } from '@/features/contractSearch/r2OfferSnapshot';
import { loadBlueprints } from '@/sde/loadSde';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import {
  bpcRowsFromContractOffers,
  bpoRowsFromContractOffers,
} from '@/engine/contracts/contractOffers';
import { MINUTE_MS } from '@/lib/age';

const CACHE_KEY = 'publicContractOffers';

const SNAPSHOT_PUBLISH_INTERVAL_MS = 30 * MINUTE_MS;

export interface PublicBpcContractsSnapshot {
  rows: BpcContractRow[];
  originals?: BpcContractRow[];
  lastSyncedAt: number | null;
}

async function fetchSnapshot(): Promise<PublicBpcContractsSnapshot | null> {
  const index = await loadR2OfferIndex();
  if (!index) return null;
  const { lastSyncedAt } = index.data;
  const cached = await readCached<PublicBpcContractsSnapshot>(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY);
  if (cached?.lastSyncedAt === lastSyncedAt) return cached;
  try {
    const blueprints = await loadBlueprints();
    const typeIds = Object.keys(blueprints)
      .map(Number)
      .filter((typeId) => String(typeId) in index.data.types);
    const offers = await loadR2BlueprintRows(index.data, typeIds);
    if (!offers) return null;
    return {
      rows: bpcRowsFromContractOffers(offers),
      originals: bpoRowsFromContractOffers(offers),
      lastSyncedAt,
    };
  } catch {
    return null;
  }
}

export function loadPublicBpcContracts(): Promise<CachedResult<PublicBpcContractsSnapshot> | null> {
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, fetchSnapshot, {
    staleAfterMs: SNAPSHOT_PUBLISH_INTERVAL_MS,
    allowStaleServe: true,
  });
}
