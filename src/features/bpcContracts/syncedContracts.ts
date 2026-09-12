/**
 * Reads the Public Contract Offers snapshot (issues #906, #907, ADR 0013): a
 * shared, admin-write-only Firestore collection populated by the
 * `syncPublicContractOffers` scheduled function, narrowed here to the
 * blueprint copies BPC Search searches. Until #907 that narrowing was a
 * second, blueprint-only ingestion pipeline and its own collection; the
 * snapshot now carries every for-sale item type and each consumer takes the
 * slice it wants.
 *
 * It is not per-character data, so it goes through `esi/cache.ts`'s
 * `GLOBAL_CACHE_CHARACTER_ID` sentinel, same trade every other
 * character-independent public lookup makes (`stations.ts`,
 * `regionNames.ts`). Reading still requires being signed in to Firebase as
 * *some* character (the collection's rule is `request.auth != null`), which
 * `ensureSignedIn` already is on every character switch for the sync feature
 * proper — this reuses that session rather than minting a second one.
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  type CachedResult,
} from '@/esi/cache';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import {
  bpcRowsFromContractOffers,
  type PublicContractOfferRow,
} from '@/engine/contracts/contractOffers';

const COLLECTION = 'publicContractOffers';
const META_DOC_ID = 'meta';
const CACHE_KEY = 'publicContractOffers';

export interface PublicBpcContractsSnapshot {
  rows: BpcContractRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read Firestore. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

interface ChunkDocData {
  rows: PublicContractOfferRow[];
}

interface MetaDocData {
  lastSyncedAt: number;
}

/**
 * Each chunk is narrowed as it is read rather than after the whole snapshot is
 * accumulated: the shared collection holds roughly three times the rows the
 * blueprint-only one did, and only the blueprint copies are worth retaining
 * (or caching). The extra rows are then transient — one chunk at a time —
 * instead of a 3x heap and a 3x Dexie entry.
 */
async function fetchSnapshot(characterId: number): Promise<PublicBpcContractsSnapshot | null> {
  if (!isSyncConfigured()) return null;
  await ensureSignedIn(characterId);

  const snapshot = await getDocs(collection(getSyncFirestore(), COLLECTION));
  const rows: BpcContractRow[] = [];
  let lastSyncedAt: number | null = null;
  for (const docSnap of snapshot.docs) {
    if (docSnap.id === META_DOC_ID) {
      lastSyncedAt = (docSnap.data() as MetaDocData).lastSyncedAt ?? null;
    } else {
      rows.push(...bpcRowsFromContractOffers((docSnap.data() as ChunkDocData).rows));
    }
  }
  return { rows, lastSyncedAt };
}

/**
 * Cache-through the same way every ESI-backed view loads (`fromCache` for
 * the offline banner, a manual refresh re-fetches) even though the live side
 * is Firestore, not ESI — `loadWithCache` only needs a `fetchLive`.
 */
export function loadPublicBpcContracts(
  characterId: number
): Promise<CachedResult<PublicBpcContractsSnapshot> | null> {
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, () => fetchSnapshot(characterId), {
    staleAfterMs: STALE_AFTER.default,
  });
}
