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
 * *some* character (the collection's rule is `request.auth != null`), so
 * `ensureAnySession` reuses whichever session the sync feature already holds
 * rather than swapping it to the active character mid-sync (issue #2262).
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { readUnchangedSnapshot } from '@/features/contractSearch/chunkedSnapshot';
import {
  loadWithCache,
  readCached,
  GLOBAL_CACHE_CHARACTER_ID,
  type CachedResult,
} from '@/esi/cache';
import { loadR2OfferIndex, loadR2TypeRows } from '@/features/contractSearch/r2OfferSnapshot';
import { loadBlueprints } from '@/sde/loadSde';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import {
  bpcRowsFromContractOffers,
  bpoRowsFromContractOffers,
  type PublicContractOfferRow,
} from '@/engine/contracts/contractOffers';

const COLLECTION = 'publicContractOffers';
const META_DOC_ID = 'meta';
const CACHE_KEY = 'publicContractOffers';

/**
 * How often the backend republishes the snapshot, and therefore the soonest a
 * refetch can return anything new. `STALE_AFTER.default`'s ten minutes is the
 * app-wide promise for a *Character's* own mutable data; against a twice-hourly
 * publish it just re-downloads a byte-identical snapshot up to three times per
 * cycle, which is a much worse trade now that the shared snapshot carries every
 * item type and is ~3x the size the blueprint-only one was. The panel's own
 * Refresh still bypasses this, and the UI shows the snapshot's `lastSyncedAt`
 * rather than when this browser last read Firestore.
 */
const SNAPSHOT_PUBLISH_INTERVAL_MS = 30 * 60_000;

export interface PublicBpcContractsSnapshot {
  rows: BpcContractRow[];
  /**
   * Blueprint originals on public contract (issue #1240), `runs: -1`. Kept out
   * of `rows` so BPC Sourcing's copy-only search is unchanged. Optional: a
   * snapshot cached before this field existed has none, which reads as "no
   * listed originals" until the next refetch.
   */
  originals?: BpcContractRow[];
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
 * The same snapshot from R2 (ADR 0019, issue #3746): only the blueprint types
 * are read, found by crossing the index's listed types with the SDE's
 * blueprints, instead of every type. `null` when R2 or the SDE cannot answer,
 * and the Firestore read takes over.
 *
 * One consequence: a contract's other lines are not read, so a bundle mixing
 * one blueprint with ordinary items tallies as a single-type contract and is
 * not flagged `isMultiType` (issue #1076). A bundle of two or more blueprint
 * types still is.
 */
async function fetchSnapshotFromR2(): Promise<PublicBpcContractsSnapshot | null> {
  const index = await loadR2OfferIndex();
  if (!index) return null;
  const { lastSyncedAt } = index.data;
  // Stale but unchanged: nothing to read.
  const cached = await readCached<PublicBpcContractsSnapshot>(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY);
  if (cached?.lastSyncedAt === lastSyncedAt) return cached;
  try {
    const blueprints = await loadBlueprints();
    const typeIds = Object.keys(blueprints)
      .map(Number)
      .filter((typeId) => String(typeId) in index.data.types);
    const offers = await loadR2TypeRows(index.data, typeIds);
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

/**
 * Every chunk's raw rows are accumulated before narrowing, rather than each
 * chunk being narrowed as it is read: `bpcRowsFromContractOffers` tallies
 * distinct for-sale types per contract (issue #1076), and a contract's own
 * lines are not guaranteed to land in one chunk — the backend sorts by
 * contract before slicing into fixed-size chunks (`functions/src/index.ts`'s
 * `chunkRows`), so a contract can still straddle a chunk boundary if its own
 * line count is large enough (a real case: one archived bundle ran to 493
 * lines). Narrowing per chunk would tally each half of such a contract as
 * its own single-type listing — silently wrong in exactly the case this
 * fix exists for.
 *
 * `getDocs` already pulls every chunk doc into memory in one round trip (this
 * loop's `snapshot.docs` is not a network stream), so accumulating raw rows
 * first costs one transient array for the duration of this call, not a
 * second live copy — discarded the moment `bpcRowsFromContractOffers`
 * returns the narrowed rows below.
 */
async function fetchSnapshot(characterId: number): Promise<PublicBpcContractsSnapshot | null> {
  const fromR2 = await fetchSnapshotFromR2();
  if (fromR2) return fromR2;
  if (!isSyncConfigured()) return null;
  await ensureAnySession(characterId);

  // Stale but unchanged: one `meta` read instead of the whole collection.
  const unchanged = await readUnchangedSnapshot<PublicBpcContractsSnapshot>(CACHE_KEY, COLLECTION);
  if (unchanged) return unchanged;

  const snapshot = await getDocs(collection(getSyncFirestore(), COLLECTION));
  const offers: PublicContractOfferRow[] = [];
  let lastSyncedAt: number | null = null;
  for (const docSnap of snapshot.docs) {
    if (docSnap.id === META_DOC_ID) {
      lastSyncedAt = (docSnap.data() as MetaDocData).lastSyncedAt ?? null;
    } else {
      offers.push(...(docSnap.data() as ChunkDocData).rows);
    }
  }
  return {
    rows: bpcRowsFromContractOffers(offers),
    originals: bpoRowsFromContractOffers(offers),
    lastSyncedAt,
  };
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
    staleAfterMs: SNAPSHOT_PUBLISH_INTERVAL_MS,
  });
}
