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
 * `request.auth != null`), so `ensureAnySession` reuses whichever session
 * the sync feature already holds rather than swapping it (issue #2262).
 * Cache-through the way every ESI-backed view loads (`fromCache` for the
 * offline banner, a manual refresh re-fetches) even
 * though the live side is Firestore, not ESI — `loadWithCache` only needs a
 * `fetchLive`.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { create } from 'zustand';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';

const META_DOC_ID = 'meta';

/** The offers snapshot's cache key; also what its chunk-download progress is keyed by. Lives here, not in `publicContractOffers.ts`, so a view can read progress without importing the loader. */
export const OFFERS_CACHE_KEY = 'publicContractOffersAll';

export interface ChunkedSnapshot<TRow> {
  rows: TRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read Firestore. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

interface ChunkDocData<TRow> {
  rows: TRow[];
  /** The publish this chunk belongs to; absent on a chunk written before the stamp existed. */
  publishedAt?: number;
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

/** Mirrors `functions/src/publicContracts.ts`'s `chunkDocId`; `chunkedSnapshot.test.ts` pins the two together. */
export function chunkDocId(index: number): string {
  return `chunk-${String(index).padStart(4, '0')}`;
}

/** How many chunk docs are in flight at once: enough to hide round-trip latency, few enough not to starve the page's other requests. */
export const CHUNK_READ_CONCURRENCY = 6;

/**
 * How far a snapshot's chunk download has got, per cache key. A store beside
 * the loader rather than a return value, because the loader runs inside
 * `loadWithCache`, which settles once, at the end — nothing on that path can
 * report "40 of 124" while it is still running. `total` is `null` until the
 * `meta` doc has said how many chunks there are.
 */
export interface ChunkProgress {
  done: number;
  total: number | null;
}

interface ProgressStore {
  byKey: Record<string, ChunkProgress | undefined>;
  set(key: string, progress: ChunkProgress | null): void;
}

export const useChunkProgressStore = create<ProgressStore>((set) => ({
  byKey: {},
  set: (key, progress) =>
    set((state) => {
      const byKey = { ...state.byKey };
      if (progress === null) delete byKey[key];
      else byKey[key] = progress;
      return { byKey };
    }),
}));

/** The in-flight chunk download for a snapshot, or `undefined` when none is running. */
export function useChunkProgress(cacheKey: string): ChunkProgress | undefined {
  return useChunkProgressStore((state) => state.byKey[cacheKey]);
}

/** `meta`'s fields, where `chunkCount` is absent on a snapshot published before the count was recorded. */
async function readMeta(collectionName: string): Promise<MetaDocData & { chunkCount?: number }> {
  const metaSnap = await getDoc(doc(getSyncFirestore(), collectionName, META_DOC_ID));
  return (
    (metaSnap.data() as (MetaDocData & { chunkCount?: number }) | undefined) ?? {
      lastSyncedAt: 0,
    }
  );
}

/** The whole collection in one query: no progress to report, so only the fallback when `meta` carries no chunk count. */
async function readWholeCollection<TRow>(
  source: ChunkedSnapshotSource
): Promise<ChunkedSnapshot<TRow>> {
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

/**
 * The chunk docs, in order, plus whether any belongs to a different publish
 * than the `meta` this read began with. Every chunk is stamped with its
 * publish's `lastSyncedAt` (`chunkDocData` in the writer), because `meta` is
 * written *after* the chunks: for the length of a publish `meta` still names
 * the previous one while the chunks are already new, so re-reading `meta`
 * proves nothing. A chunk with no stamp predates the stamp and is accepted.
 */
async function readChunks<TRow>(
  source: ChunkedSnapshotSource,
  chunkCount: number,
  publishedAt: number
): Promise<{ chunks: TRow[][]; mixed: boolean }> {
  const chunks: TRow[][] = new Array<TRow[]>(chunkCount);
  let next = 0;
  let done = 0;
  let mixed = false;
  let failed = false;
  const report = useChunkProgressStore.getState().set;
  report(source.cacheKey, { done, total: chunkCount });
  async function worker(): Promise<void> {
    while (next < chunkCount && !failed) {
      const index = next;
      next += 1;
      try {
        const snap = await getDoc(
          doc(getSyncFirestore(), source.collectionName, chunkDocId(index))
        );
        const data = snap.data() as ChunkDocData<TRow> | undefined;
        chunks[index] = data?.rows ?? [];
        if (data?.publishedAt !== undefined && data.publishedAt !== publishedAt) mixed = true;
      } catch (error) {
        // One failed chunk fails the read; the other workers stop instead of
        // reporting progress for a download that is already lost.
        failed = true;
        throw error;
      }
      done += 1;
      if (!failed) report(source.cacheKey, { done, total: chunkCount });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNK_READ_CONCURRENCY, chunkCount) }, worker));
  return { chunks, mixed };
}

/**
 * Reads `meta`, then the chunk docs it counts, a few at a time, reporting each
 * landing (`useChunkProgress`). If a publish landed mid-read, some chunks carry
 * a newer stamp than `meta` did at the start; the whole read is then retried
 * once, so a half-old, half-new snapshot is never cached for the window.
 */
async function fetchSnapshot<TRow>(
  source: ChunkedSnapshotSource,
  characterId: number
): Promise<ChunkedSnapshot<TRow> | null> {
  if (!isSyncConfigured()) return null;
  await ensureAnySession(characterId);

  try {
    for (let attempt = 0; ; attempt += 1) {
      const meta = await readMeta(source.collectionName);
      if (meta.chunkCount === undefined) return await readWholeCollection<TRow>(source);
      const { chunks, mixed } = await readChunks<TRow>(source, meta.chunkCount, meta.lastSyncedAt);
      if (!mixed || attempt >= 1) {
        return { rows: chunks.flat(), lastSyncedAt: meta.lastSyncedAt || null };
      }
    }
  } finally {
    useChunkProgressStore.getState().set(source.cacheKey, null);
  }
}

/**
 * What one read of a snapshot yielded, and whether a newer one is still on its
 * way.
 *
 * `revalidating` is the visible half of `allowStaleServe`: the rows below
 * lapsed their window, so they are last cycle's and a live read is running
 * behind them. It is derived from the row's own `fetchedAt` rather than
 * reported by the cache, because that is the only thing that stays true across
 * the re-read the revalidation signal provokes — the flag clears by itself
 * when the fresher row lands.
 *
 * A read that *failed* is not reported here: it comes back as `fromCache` on
 * the cached result, which is the more alarming news and the one the view
 * should say instead.
 */
export interface ChunkedSnapshotRead<TRow> {
  cached: CachedResult<ChunkedSnapshot<TRow>> | null;
  revalidating: boolean;
}

export async function loadChunkedSnapshot<TRow>(
  source: ChunkedSnapshotSource,
  characterId: number
): Promise<ChunkedSnapshotRead<TRow>> {
  const cached = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    source.cacheKey,
    () => fetchSnapshot<TRow>(source, characterId),
    // A long window here is a publish cadence, not a claim that the payload is
    // a constant, so the lapsed row is the right thing to render while the
    // next read runs (issue #963). Without this the whole collection — 124
    // chunk docs for the offers snapshot — is a blocking spinner every time
    // the window lapses, for rows that are at most one publish cycle old.
    // `fromCache` still reports a revalidation that failed, so a refresh that
    // never lands is stated rather than left standing as "loading".
    { staleAfterMs: source.staleAfterMs, allowStaleServe: true }
  );
  // `fetchedAt` alone, where `esi/cache.ts`'s own freshness test also honours a
  // stored `expiresAt`: that field comes from an ESI `Expires` header, and this
  // payload is read from Firestore, which sends none. Nothing writes it for
  // these keys, so the two tests cannot disagree.
  const lapsed = cached !== null && cached.fetchedAt.getTime() + source.staleAfterMs <= Date.now();
  return { cached, revalidating: lapsed && !cached.fromCache };
}
