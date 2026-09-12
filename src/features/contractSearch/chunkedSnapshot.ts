/**
 * The read half of `functions/src/index.ts`'s `writeChunkedSnapshot`: a
 * Firestore collection holding one `meta` doc plus N chunk docs, each a `rows`
 * array, pulled back as one array and one timestamp.
 *
 * Shared by both public-contract snapshots (issues #908, #910). They differ in
 * collection, cache key and row type and in nothing else — the chunk/meta
 * layout belongs to the writer, not to either reader, so restating it per
 * collection would be one more place for a reader to drift from the function
 * that writes it.
 *
 * Neither snapshot is per-character data, so both go through `esi/cache.ts`'s
 * `GLOBAL_CACHE_CHARACTER_ID` sentinel — the same trade every other
 * character-independent public lookup makes. Reading still requires being
 * signed in to Firebase as *some* character (each collection's rule is
 * `request.auth != null`), which `ensureSignedIn` already is on every
 * character switch. Cache-through the way every ESI-backed view loads
 * (`fromCache` for the offline banner, a manual refresh re-fetches) even
 * though the live side is Firestore, not ESI — `loadWithCache` only needs a
 * `fetchLive`.
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';

const META_DOC_ID = 'meta';

export interface ChunkedSnapshot<TRow> {
  rows: TRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read Firestore. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

interface ChunkDocData<TRow> {
  rows: TRow[];
}

interface MetaDocData {
  lastSyncedAt: number;
}

/** Which snapshot to read, and under what key to cache it. */
export interface ChunkedSnapshotSource {
  collectionName: string;
  /**
   * Distinct per payload shape, never per consumer: BPC Search already holds
   * the blueprint-only narrowing of the offers collection under
   * `publicContractOffers`, so two different shapes under one key would be a
   * corrupt cache rather than a shared one.
   */
  cacheKey: string;
  /**
   * Matched to how often the backend republishes, which is the soonest a
   * refetch can return anything new. Against a twice-hourly publish,
   * `STALE_AFTER.default`'s ten minutes just re-downloads a byte-identical
   * snapshot up to three times per cycle.
   *
   * A window this long also puts the entry out of a manual Refresh's reach:
   * `isRefreshInvalidated` deliberately only bypasses keys on the default
   * window, so a panel's Refresh re-runs the loader but reads the entry back
   * until the window lapses. That is the honest behaviour for a snapshot the
   * backend republishes on its own clock — there is nothing newer to fetch —
   * and the UI names the snapshot's own `lastSyncedAt` rather than when this
   * browser last read Firestore, so what is on screen still says how old it
   * is.
   */
  staleAfterMs: number;
}

async function fetchSnapshot<TRow>(
  source: ChunkedSnapshotSource,
  characterId: number
): Promise<ChunkedSnapshot<TRow> | null> {
  if (!isSyncConfigured()) return null;
  await ensureSignedIn(characterId);

  const snapshot = await getDocs(collection(getSyncFirestore(), source.collectionName));
  const rows: TRow[] = [];
  let lastSyncedAt: number | null = null;
  for (const docSnap of snapshot.docs) {
    if (docSnap.id === META_DOC_ID) {
      lastSyncedAt = (docSnap.data() as MetaDocData).lastSyncedAt ?? null;
    } else {
      rows.push(...(docSnap.data() as ChunkDocData<TRow>).rows);
    }
  }
  return { rows, lastSyncedAt };
}

export function loadChunkedSnapshot<TRow>(
  source: ChunkedSnapshotSource,
  characterId: number
): Promise<CachedResult<ChunkedSnapshot<TRow>> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    source.cacheKey,
    () => fetchSnapshot<TRow>(source, characterId),
    { staleAfterMs: source.staleAfterMs }
  );
}
