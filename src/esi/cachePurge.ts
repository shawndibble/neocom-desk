/**
 * Privacy purge for the per-character ESI cache.
 *
 * Two events revoke consent for a character's scoped `esiCache` rows and must
 * take the cached copies with them: a scope removed from the granted set, and
 * a changed `ownerHash` — character sold or transferred, so the rows are a
 * different person's. Callers are `auth/session.ts` and `sync/planSync.ts`; a
 * future "remove character"/logout is the third, and there must stay exactly
 * one purge primitive.
 *
 * Split from `cache.ts`, which owns the `esiCache` table
 * (docs/ARCHITECTURE.md §2), only so auth and sync can purge without
 * importing the read-through machinery.
 */
import Dexie from 'dexie';
import { db } from '@/db';
import { CORP_CACHE_KEY_PREFIX, GLOBAL_CACHE_CHARACTER_ID } from './cache';

/**
 * Delete every cached ESI row for one character. Returns the number deleted.
 *
 * Deliberately blunt — the whole cache, not just the revoked scope's rows.
 * `esiCache` is 100% re-derivable from ESI, so over-purging costs one refetch
 * while under-purging is a privacy bug. (Precision would need a cache-key →
 * scope map; `registry.ts` keys on endpoint *name* and cache keys are string
 * literals in `features/*` with no link back to it.)
 *
 * `GLOBAL_CACHE_CHARACTER_ID` rows are public reference data owned by no
 * character, so no revoked consent can apply to them — skipped.
 */
/**
 * Listeners notified after one Character's cached rows are purged, so
 * in-memory copies of those same rows go with them. Same one-way shape as
 * `cache.ts`'s `onCacheRevalidated`: `esi` publishes, the React layer
 * (`lib/routeSnapshotCache.ts`) subscribes, and `esi` gains no dependency on
 * it.
 */
type PurgedListener = (characterId: number) => void;
const purgedListeners = new Set<PurgedListener>();

export function onCachePurged(listener: PurgedListener): () => void {
  purgedListeners.add(listener);
  return () => purgedListeners.delete(listener);
}

function emitCachePurged(characterId: number): void {
  for (const listener of purgedListeners) listener(characterId);
}

export async function purgeCharacterCache(characterId: number): Promise<number> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 0;
  // The compound primary key [characterId+key] is the only index — no
  // standalone characterId one — so this is a range delete, not an equality
  // match.
  const deleted = await db.esiCache
    .where('[characterId+key]')
    .between([characterId, Dexie.minKey], [characterId, Dexie.maxKey], true, true)
    .delete();
  // Emitted even for a zero-row delete: the in-memory listeners hold copies
  // this range delete cannot see, so "nothing in Dexie" is not "nothing to
  // forget".
  emitCachePurged(characterId);
  return deleted;
}

/**
 * Delete one character's **corp-owned** cached rows, leaving everything else.
 * Returns the number deleted.
 *
 * The third consent trigger, and the only surgical one (issue #293). A
 * character who changes corporation is still the same person under the same
 * grant, so neither `revokedScopes` nor the `ownerHash` check fires — but the
 * new corp's members are not entitled to the old corp's structures or wallets.
 * The reverse is just as important: a corp change must NOT cost the pilot
 * their own skills, mail and wallet, which is why this is a prefix range and
 * not `purgeCharacterCache`.
 *
 * Precision is affordable here, unlike on scope revocation, precisely because
 * `cache.corpCacheKey` makes corp rows self-identifying — there is no cache-key
 * → scope map to invent.
 *
 * Every corporation's rows go, not just the one being left: a pilot who has
 * moved A → B → A has rows under both, and none of them survive the move.
 */
export async function purgeCorpScopedCache(characterId: number): Promise<number> {
  // Corp data is never public, so nothing should be filed under the sentinel;
  // refusing it keeps the one rule ("global rows are owned by no character")
  // identical across both purges.
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 0;
  // Prefix range over the compound primary key, exactly as `purgeCharacterCache`
  // ranges over one character. U+FFFF is the highest UTF-16 code unit, so the
  // bound sits above every `corp:…` key. A key merely STARTING with "corp" is
  // outside the range in both directions: ':' (U+003A) sorts above every digit,
  // so `corp0…` falls under the lower bound, and below every letter, so
  // `corporation-history` falls over the upper one.
  const upperBound = CORP_CACHE_KEY_PREFIX + String.fromCharCode(0xffff);
  return db.esiCache
    .where('[characterId+key]')
    .between([characterId, CORP_CACHE_KEY_PREFIX], [characterId, upperBound], true, true)
    .delete();
}

// ---------------------------------------------------------------------------
// The purge above can fail (quota, corrupted store, private browsing) and runs
// inside login/token refresh, so it never throws — a Dexie hiccup must not lock
// the user out of the app. It escalates instead:
//
//   1. targeted   — the range delete above.
//   2. full       — `esiCache.clear()`. Every character refetches, global rows
//                   included, but far more likely to succeed than a range
//                   delete over a damaged compound index.
//   3. suppressed — the rows could not be deleted, so they are never READ.
//
// Tier 3 is reachable because the failure is asymmetric: an over-quota origin,
// or a damaged index, fails readWRITE transactions while readonly ones keep
// working — precisely the state where stale rows are both undeletable and
// readable.
//
// THE TRADE: a suppressed character's cache reads return nothing, so going
// offline shows an EMPTY view instead of a stale one. That is correct — an
// empty Wallet is a nuisance, another person's Wallet is the privacy bug this
// module exists to close.
//
// Suppression is held in two places on purpose:
//
//   - an in-memory Set, which cannot fail and so is authoritative for this
//     session. Origin-wide quota exhaustion fails the durable write too,
//     exactly when tier 3 is reached, so a purely durable marker would have a
//     hole. (The narrower per-store failure — esiCache broken, settings
//     writable — is where the durable marker actually lands.)
//   - a `db.settings` row, so suppression survives a reload while the retry
//     keeps failing. Deliberately NOT 'sync.'-prefixed: device state, and
//     `setSyncedSetting` rejecting non-'sync.' keys is the marker of that
//     intent. One device's broken storage must not blind the others.
// ---------------------------------------------------------------------------

/** Marker prefix in `db.settings`. Device-local; see above. */
export const CACHE_PURGE_PENDING_PREFIX = 'esiCache.purgePending.';

const pendingKey = (characterId: number) => `${CACHE_PURGE_PENDING_PREFIX}${characterId}`;

/** Session-authoritative suppression set. Every in-tab writer mutates it synchronously. */
const pending = new Set<number>();

/**
 * One durable read per session, memoized. Safe because the only writers
 * (`markCachePurgePending`/`clearCachePurgePending`) update `pending`
 * synchronously, so the memo can never answer "not suppressed" for a character
 * this tab suppressed. Another tab's later marker is not seen until reload —
 * that tab's own purge already deleted the rows in every case but tier 3, and
 * tier 3 means the shared IndexedDB is failing for this tab too.
 */
let hydration: Promise<void> | null = null;

function hydratePending(): Promise<void> {
  hydration ??= db.settings
    .where('key')
    .startsWith(CACHE_PURGE_PENDING_PREFIX)
    .toArray()
    .then((rows) => {
      for (const row of rows) {
        const characterId = Number(row.key.slice(CACHE_PURGE_PENDING_PREFIX.length));
        if (Number.isInteger(characterId) && characterId !== GLOBAL_CACHE_CHARACTER_ID) {
          pending.add(characterId);
        }
      }
    })
    .catch(() => {
      // Reads failing too: retry on the next lookup rather than caching a
      // hole. The in-memory set still answers this session's own purges.
      hydration = null;
    });
  return hydration;
}

/**
 * True while a character's purge is outstanding — `cache.ts`'s read path must
 * then behave as if nothing were cached for it. One Set lookup after the first
 * call, which pays a single indexed prefix scan of `db.settings`.
 */
export async function isCachePurgePending(characterId: number): Promise<boolean> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return false;
  if (pending.has(characterId)) return true;
  try {
    await hydratePending();
  } catch {
    // A closed or schema-broken Dexie throws SYNCHRONOUSLY out of `where(...)`,
    // before `hydratePending` has a promise to attach its catch to. Both
    // callers await this unguarded: `cache.ts`'s read path, which promises it
    // never throws, and `persistTokens`, where throwing would cost the user
    // their login. Fails the same direction as a rejected hydration.
  }
  return pending.has(characterId);
}

/**
 * Drop the pending marker. Exported because a successful purge is not its only
 * caller — a future "remove character"/logout clears it too.
 */
export async function clearCachePurgePending(characterId: number): Promise<void> {
  pending.delete(characterId);
  try {
    await db.settings.delete(pendingKey(characterId));
  } catch {
    // The purge already succeeded, so nothing stale remains; worst case is
    // one redundant retry after the next reload.
  }
}

async function markCachePurgePending(characterId: number): Promise<void> {
  pending.add(characterId); // cannot fail — this is the guarantee
  try {
    await db.settings.put({ key: pendingKey(characterId), value: true });
  } catch {
    // Durability lost, suppression kept until this tab reloads.
  }
}

/** Which tier of the escalating fallback did the job. */
export type CachePurgeOutcome = 'targeted' | 'full' | 'suppressed';

/**
 * Purge a character's cached ESI data, degrading rather than failing. NEVER
 * throws: it runs inside `auth/session.persistTokens`, where that would cost
 * the user their login. Tiers above.
 *
 * Idempotent and safe to call speculatively — `persistTokens` calls it on
 * every grant with an outstanding purge, which is how tiers 2 and 3 retry.
 */
export async function purgeCharacterCacheOrSuppress(
  characterId: number
): Promise<CachePurgeOutcome> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 'targeted';

  let outcome: CachePurgeOutcome = 'targeted';
  try {
    await purgeCharacterCache(characterId);
  } catch {
    // Tier 1 threw before its own emit, and the in-memory copies must go
    // whichever tier ends up doing the durable work — including tier 3, which
    // does none.
    emitCachePurged(characterId);
    try {
      // Tier 2: everything, global rows included. Correctness over churn.
      await db.esiCache.clear();
      outcome = 'full';
    } catch {
      await markCachePurgePending(characterId);
      return 'suppressed';
    }
  }
  await clearCachePurgePending(characterId);
  return outcome;
}
