/**
 * Reads the public BPC contract search's synced snapshot (issue #608, ADR
 * 0013): a small, shared, admin-write-only Firestore collection populated by
 * the `syncPublicBpcContracts` scheduled function — not per-character data,
 * so it goes through `esi/cache.ts`'s `GLOBAL_CACHE_CHARACTER_ID` sentinel,
 * same trade every other character-independent public lookup makes (`stations.ts`,
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

const COLLECTION = 'publicBpcContracts';
const META_DOC_ID = 'meta';
const CACHE_KEY = 'publicBpcContracts';

export interface PublicBpcContractsSnapshot {
  rows: BpcContractRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read Firestore. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

interface ChunkDocData {
  rows: BpcContractRow[];
}

interface MetaDocData {
  lastSyncedAt: number;
}

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
      rows.push(...(docSnap.data() as ChunkDocData).rows);
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
