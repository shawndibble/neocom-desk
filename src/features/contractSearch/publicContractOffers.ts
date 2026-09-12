/**
 * Reads the Public Contract Offers snapshot (issues #906, #908, ADR 0013)
 * whole — every for-sale line of a public item_exchange/auction contract, any
 * item type — for the Contracts page's Search tab.
 *
 * The sibling of `features/bpcContracts/syncedContracts.ts`, which reads the
 * same Firestore collection but narrows it to blueprint copies as it goes.
 * The two are separate reads with separate cache entries on purpose; see
 * `docs/context/decisions/` for #908 on why the alternative (one shared
 * full-size cache entry, with BPC Search narrowing from it) was not taken.
 *
 * Not per-character data, so it goes through `esi/cache.ts`'s
 * `GLOBAL_CACHE_CHARACTER_ID` sentinel, the same trade every other
 * character-independent public lookup makes. Reading still requires being
 * signed in to Firebase as *some* character (the collection's rule is
 * `request.auth != null`), which `ensureSignedIn` already is on every
 * character switch.
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

const COLLECTION = 'publicContractOffers';
const META_DOC_ID = 'meta';

/**
 * Deliberately *not* `publicContractOffers` — that key is BPC Search's, and
 * it holds the blueprint-only narrowing of this same collection. Two
 * different payload shapes under one key is a corrupt cache, not a shared
 * one.
 */
const CACHE_KEY = 'publicContractOffersAll';

/**
 * How often the backend republishes the snapshot, and therefore the soonest a
 * refetch can return anything new — matched to the publish interval for the
 * same reason `syncedContracts.ts` does it: against a twice-hourly publish,
 * `STALE_AFTER.default`'s ten minutes just re-downloads a byte-identical
 * snapshot up to three times per cycle, which this read can afford even less
 * than that one.
 *
 * A window this long also puts the entry out of a manual Refresh's reach:
 * `isRefreshInvalidated` deliberately only bypasses keys on the default
 * window, so the panel's Refresh re-runs the loader but reads this entry back
 * until the 30 minutes lapse. That is the honest behaviour for a snapshot the
 * backend republishes on its own clock — there is nothing newer to fetch —
 * and the UI names the snapshot's own `lastSyncedAt` rather than when this
 * browser last read Firestore, so what is on screen still says how old it is.
 */
const SNAPSHOT_PUBLISH_INTERVAL_MS = 30 * 60_000;

export interface PublicContractOffersSnapshot {
  rows: PublicContractOfferRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read Firestore. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

interface ChunkDocData {
  rows: PublicContractOfferRow[];
}

interface MetaDocData {
  lastSyncedAt: number;
}

async function fetchSnapshot(characterId: number): Promise<PublicContractOffersSnapshot | null> {
  if (!isSyncConfigured()) return null;
  await ensureSignedIn(characterId);

  const snapshot = await getDocs(collection(getSyncFirestore(), COLLECTION));
  const rows: PublicContractOfferRow[] = [];
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
 * Cache-through the same way every ESI-backed view loads (`fromCache` for the
 * offline banner, a manual refresh re-fetches) even though the live side is
 * Firestore, not ESI — `loadWithCache` only needs a `fetchLive`.
 */
export function loadPublicContractOffers(
  characterId: number
): Promise<CachedResult<PublicContractOffersSnapshot> | null> {
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, () => fetchSnapshot(characterId), {
    staleAfterMs: SNAPSHOT_PUBLISH_INTERVAL_MS,
  });
}
