/**
 * Reads the Public Courier Contracts snapshot (issue #909) whole — every
 * outstanding public courier contract as a route and a fee — for the
 * Contracts page's Search tab (issue #910).
 *
 * The sibling of `publicContractOffers.ts` in every respect but the
 * collection: same global cache sentinel, same publish-interval staleness
 * window, same "signed in as some character" read rule. A separate collection
 * and therefore a separate read because a courier row shares none of an offer
 * row's fields — see `PublicCourierContractRow`.
 *
 * Far smaller than the offers snapshot: ADR 0013's live pull put courier and
 * loan together under 620 contracts against ~370k offer rows, so this is one
 * chunk doc. That is why the panel loads it alongside the offers snapshot
 * unconditionally rather than per mode — deferring it to the first Courier
 * click would buy nothing and cost a fetch on the way in.
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';

const COLLECTION = 'publicCourierContracts';
const META_DOC_ID = 'meta';

/** Its own key, distinct from both `publicContractOffers` (BPC Search's blueprint-only narrowing) and `publicContractOffersAll` — three payload shapes, three entries. */
const CACHE_KEY = 'publicCourierContracts';

/** Matched to the backend's publish interval, same trade `publicContractOffers.ts` documents. */
const SNAPSHOT_PUBLISH_INTERVAL_MS = 30 * 60_000;

export interface PublicCourierContractsSnapshot {
  rows: PublicCourierContractRow[];
  /** When the backend last pulled EVE Ref's archive. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

interface ChunkDocData {
  rows: PublicCourierContractRow[];
}

interface MetaDocData {
  lastSyncedAt: number;
}

async function fetchSnapshot(characterId: number): Promise<PublicCourierContractsSnapshot | null> {
  if (!isSyncConfigured()) return null;
  await ensureSignedIn(characterId);

  const snapshot = await getDocs(collection(getSyncFirestore(), COLLECTION));
  const rows: PublicCourierContractRow[] = [];
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

export function loadPublicCourierContracts(
  characterId: number
): Promise<CachedResult<PublicCourierContractsSnapshot> | null> {
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, () => fetchSnapshot(characterId), {
    staleAfterMs: SNAPSHOT_PUBLISH_INTERVAL_MS,
  });
}
