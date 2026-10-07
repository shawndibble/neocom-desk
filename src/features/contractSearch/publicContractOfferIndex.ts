/**
 * The index beside the Public Contract Offers chunks (issue #2921): per listed
 * item type, how many offers, the cheapest ask and which chunk docs hold them,
 * plus every region with an offer. Small enough to arrive in one read, which is
 * what lets the Items board suggest item names and fill its region list while
 * the ~124 chunk docs are still coming down — and fetch only the chunks of the
 * item actually being searched.
 *
 * Everything here is an optimisation. An absent or unreadable index (a
 * snapshot published before the writer produced one, rules not yet deployed,
 * offline with nothing cached) reads as `null`, and the board waits for the
 * full snapshot exactly as it did before.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { chunkDocId } from './chunkedSnapshot';

const INDEX_COLLECTION = 'publicContractOffersIndex';
const INDEX_DOC = 'types';
const OFFERS_COLLECTION = 'publicContractOffers';
const INDEX_CACHE_KEY = 'publicContractOffersIndex';
/** Same cadence as the chunks it describes (`publicContractOffers.ts`). */
const STALE_AFTER_MS = 30 * 60_000;
const CHUNK_READ_CONCURRENCY = 6;

/** `[count, cheapest, firstChunk, lastChunk]`, as `functions/src/publicContracts.ts` writes it. */
type RawEntry = [count: number, cheapest: number | null, firstChunk: number, lastChunk: number];

/** What the Dexie cache holds: the doc as written. */
export interface RawOfferIndex {
  lastSyncedAt: number;
  types: Record<string, RawEntry>;
  regionIds: number[];
}

export interface OfferIndexType {
  typeId: number;
  count: number;
  cheapest: number | null;
  firstChunk: number;
  lastChunk: number;
}

export interface OfferIndex {
  lastSyncedAt: number;
  types: ReadonlyMap<number, OfferIndexType>;
  regionIds: readonly number[];
}

export function parseOfferIndex(raw: RawOfferIndex): OfferIndex {
  const types = new Map<number, OfferIndexType>();
  for (const [key, [count, cheapest, firstChunk, lastChunk]] of Object.entries(raw.types)) {
    const typeId = Number(key);
    types.set(typeId, { typeId, count, cheapest, firstChunk, lastChunk });
  }
  return { lastSyncedAt: raw.lastSyncedAt, types, regionIds: raw.regionIds };
}

async function fetchIndex(characterId: number): Promise<RawOfferIndex | null> {
  if (!isSyncConfigured()) return null;
  await ensureAnySession(characterId);
  const snap = await getDoc(doc(getSyncFirestore(), INDEX_COLLECTION, INDEX_DOC));
  const data = snap.data() as Partial<RawOfferIndex> | undefined;
  if (!data?.types || typeof data.lastSyncedAt !== 'number') return null;
  return { lastSyncedAt: data.lastSyncedAt, types: data.types, regionIds: data.regionIds ?? [] };
}

/** `null` when there is no usable index; never throws. */
export async function loadOfferIndex(characterId: number): Promise<OfferIndex | null> {
  try {
    const cached = await loadWithCache(
      GLOBAL_CACHE_CHARACTER_ID,
      INDEX_CACHE_KEY,
      () => fetchIndex(characterId),
      { staleAfterMs: STALE_AFTER_MS, allowStaleServe: true }
    );
    return cached ? parseOfferIndex(cached.data) : null;
  } catch {
    return null;
  }
}

/** Chunk docs already read this publish cycle, keyed by `lastSyncedAt:chunk`, so a second search for a neighbouring type does not re-read them. */
const chunkMemo = new Map<string, Promise<PublicContractOfferRow[]>>();

function readChunk(index: OfferIndex, chunk: number): Promise<PublicContractOfferRow[]> {
  const key = `${index.lastSyncedAt}:${chunk}`;
  let pending = chunkMemo.get(key);
  if (!pending) {
    pending = getDoc(doc(getSyncFirestore(), OFFERS_COLLECTION, chunkDocId(chunk))).then((snap) => {
      const data = snap.data() as
        { rows?: PublicContractOfferRow[]; publishedAt?: number } | undefined;
      // The chunk must belong to the publish the index describes: ranges from
      // one publish are meaningless against the rows of another. An unstamped
      // chunk predates the writer that produces an index, so it cannot match.
      if (data?.publishedAt !== index.lastSyncedAt) {
        throw new Error('chunk is from another publish');
      }
      return data.rows ?? [];
    });
    // A failed or mismatched read must not poison the memo for the retry.
    pending.catch(() => chunkMemo.delete(key));
    chunkMemo.set(key, pending);
  }
  return pending;
}

/** Test seam: the memo outlives a test's own state. */
export function resetOfferChunkMemo(): void {
  chunkMemo.clear();
}

/**
 * The offers of just these types, read from only the chunk docs the index says
 * hold them. `null` when a chunk is from a different publish than the index
 * describes (its ranges cannot be trusted) or a read failed — the caller then waits for the full snapshot instead.
 */
export async function loadOffersForTypes(
  index: OfferIndex,
  typeIds: ReadonlySet<number>,
  characterId: number
): Promise<PublicContractOfferRow[] | null> {
  try {
    await ensureAnySession(characterId);
    const chunks = new Set<number>();
    for (const typeId of typeIds) {
      const entry = index.types.get(typeId);
      if (!entry) continue;
      for (let chunk = entry.firstChunk; chunk <= entry.lastChunk; chunk += 1) chunks.add(chunk);
    }
    const wanted = [...chunks].sort((a, b) => a - b);
    const byChunk = new Map<number, PublicContractOfferRow[]>();
    let next = 0;
    async function worker(): Promise<void> {
      while (next < wanted.length) {
        const chunk = wanted[next];
        next += 1;
        byChunk.set(chunk, await readChunk(index, chunk));
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CHUNK_READ_CONCURRENCY, wanted.length) }, worker)
    );

    return wanted.flatMap((chunk) =>
      (byChunk.get(chunk) ?? []).filter((row) => typeIds.has(row.typeId))
    );
  } catch {
    return null;
  }
}
