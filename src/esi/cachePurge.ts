/**
 * Privacy purge for the per-character ESI cache.
 *
 * `esiCache` holds API-derived data (wallet, mail, assets, contracts, ...)
 * that a character granted us a scope to read. Two events revoke that consent
 * and must take the cached copies with them:
 *
 *  - a scope is removed from the granted set (re-authorized with fewer scopes,
 *    or revoked in EVE's third-party-app portal) — see `auth/session.ts`;
 *  - the character's `ownerHash` changes, i.e. it was sold or transferred, so
 *    the cached rows belong to a *different person* — see `auth/session.ts`
 *    and `sync/planSync.ts`.
 *
 * Lives beside `cache.ts` because that module owns the `esiCache` table
 * (docs/ARCHITECTURE.md §2); split into its own file only so the auth and sync
 * layers can reach the purge without importing the read-through machinery.
 * There must be exactly one purge primitive — a future "remove character" /
 * logout is its third caller.
 *
 * Two entry points: `purgeCharacterCache` (the raw delete, may throw) and
 * `purgeCharacterCacheOrSuppress` (the escalating, never-throwing wrapper the
 * auth and sync layers actually call). See the tier commentary further down.
 */
import Dexie from 'dexie';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from './cache';

/**
 * Delete every cached ESI row for one character. Returns the number deleted.
 *
 * Deliberately blunt: it drops the character's whole cache rather than only
 * the rows behind a specific revoked scope. `esiCache` is 100% re-derivable
 * from ESI, so over-purging costs one refetch while under-purging is a privacy
 * bug. (Purging precisely would need a cache-key → scope map; `registry.ts`
 * keys on endpoint *name*, and cache keys are string literals in `features/*`
 * with no link back to it — that mapping is item 15a-ii.)
 *
 * `GLOBAL_CACHE_CHARACTER_ID` rows are never touched: they are the responses
 * of the endpoints `registry.ts` marks `subject: 'global'` — public universe
 * types, entity names and stations, behind no scope and owned by no character.
 * Dropping them is pure cache churn with no privacy benefit.
 */
export async function purgeCharacterCache(characterId: number): Promise<number> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 0;
  // `esiCache` has one index, the compound primary key [characterId+key], and
  // no standalone characterId index — so this is a range delete over the
  // compound key rather than a plain equality match.
  return db.esiCache
    .where('[characterId+key]')
    .between([characterId, Dexie.minKey], [characterId, Dexie.maxKey], true, true)
    .delete();
}

// ---------------------------------------------------------------------------
// Graceful degradation
//
// The purge above can fail: storage quota exhaustion, a corrupted object
// store, private-browsing restrictions. It used to be allowed to throw, which
// meant a Dexie hiccup failed the login or the token refresh it runs inside —
// locking the user out of the whole app over a cache problem. It now degrades
// instead, through three tiers, and never throws.
//
//   1. targeted   — the range delete above.
//   2. full       — `esiCache.clear()`. Expensive (every character refetches,
//                   global rows included) but far more likely to succeed than
//                   a range delete over a damaged compound index, and safe.
//   3. suppressed — the rows could not be deleted, so they are never READ.
//
// Tier 3 exists because "don't block login" must not become "serve the
// previous owner's wallet, mail and assets anyway". The failure mode that
// makes it reachable is asymmetric: an origin over quota, or a store whose
// index is damaged, fails readWRITE transactions while readonly ones keep
// working — precisely the state where stale rows stay both undeletable and
// readable.
//
// THE TRADE, stated plainly: while a character is suppressed, its cache reads
// return nothing, so going offline shows an EMPTY view instead of a stale one.
// That is the correct trade — an empty Wallet is a nuisance, another person's
// Wallet is the privacy bug this whole module exists to close.
//
// Suppression is held in two places on purpose:
//
//   - an in-memory Set, which cannot fail and so is authoritative for this
//     session. Origin-wide quota exhaustion fails the durable marker write
//     too, exactly when tier 3 is reached, so a purely durable marker would
//     have a hole. (In that same world `db.characters.put`/`db.tokens.put` in
//     persistTokens also fail and the session errors out on its own; the
//     narrower per-store failure — esiCache broken, settings writable — is
//     where the durable marker actually lands.)
//   - a `db.settings` row, so the suppression survives a reload while the
//     retry keeps failing. Deliberately NOT 'sync.'-prefixed: this is device
//     state, and `setSyncedSetting` rejecting non-'sync.' keys is the marker
//     of that intent. One device's broken storage must not blind the others.
// ---------------------------------------------------------------------------

/**
 * Prefix of the device-local "this character's cache could not be purged"
 * marker in `db.settings`. Not 'sync.'-prefixed, so `planSync` never pushes it.
 */
export const CACHE_PURGE_PENDING_PREFIX = 'esiCache.purgePending.';

const pendingKey = (characterId: number) => `${CACHE_PURGE_PENDING_PREFIX}${characterId}`;

/** Session-authoritative suppression set. Every in-tab writer mutates it synchronously. */
const pending = new Set<number>();

/**
 * One durable read per session, memoized. Safe to memoize because the only
 * writers are `markCachePurgePending`/`clearCachePurgePending` below, which update
 * `pending` synchronously — so the memo can never answer "not suppressed" for
 * a character this tab suppressed. Another tab's marker, set after we
 * hydrated, is not seen until reload; that tab's own purge attempt already
 * deleted the rows in every case except tier 3, and tier 3 means the shared
 * IndexedDB is failing for this tab too.
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
      // Reads are failing too; retry on the next lookup rather than caching a
      // hole. The in-memory set still answers for this session's own purges.
      hydration = null;
    });
  return hydration;
}

/**
 * True while a character's cache purge is outstanding — the read path in
 * `cache.ts` must then behave as if nothing were cached for that character.
 *
 * Costs one Set lookup after the first call. The first call pays a single
 * indexed prefix scan of `db.settings` (a table of tens of rows), not a read
 * per cache row.
 */
export async function isCachePurgePending(characterId: number): Promise<boolean> {
  // Global rows are public reference data owned by no character, so no
  // character's revoked consent can apply to them.
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return false;
  if (pending.has(characterId)) return true;
  try {
    await hydratePending();
  } catch {
    // A closed or schema-broken Dexie throws SYNCHRONOUSLY out of `where(...)`,
    // before `hydratePending` has a promise to attach its own catch to. Both
    // callers await this unguarded — `cache.ts`'s read path, which promises it
    // never throws, and `persistTokens`, where throwing would cost the user
    // their login. Same fail direction as a rejected hydration: this session's
    // own purges still answer from the in-memory set, and the lookup retries.
  }
  return pending.has(characterId);
}

/**
 * Drop the pending marker. Exported because a successful purge is not its only
 * caller — a future "remove character"/logout clears it too.
 *
 * Failing to delete the durable row is not an error: the purge that preceded
 * it already succeeded, so nothing stale remains, and the worst case is one
 * redundant retry after the next reload.
 */
export async function clearCachePurgePending(characterId: number): Promise<void> {
  pending.delete(characterId);
  try {
    await db.settings.delete(pendingKey(characterId));
  } catch {
    // See above: safe to ignore.
  }
}

async function markCachePurgePending(characterId: number): Promise<void> {
  pending.add(characterId); // cannot fail — this is the guarantee
  try {
    await db.settings.put({ key: pendingKey(characterId), value: true });
  } catch {
    // Durability lost, suppression kept. Survives until this tab reloads.
  }
}

/** Which tier of the escalating fallback ended up doing the job. */
export type CachePurgeOutcome = 'targeted' | 'full' | 'suppressed';

/**
 * Purge a character's cached ESI data, degrading rather than failing.
 *
 * NEVER throws: it runs inside `auth/session.persistTokens`, so throwing would
 * fail the login or the token refresh. See the tier commentary above for what
 * each outcome means and why tier 3 suppresses reads instead of ignoring the
 * failure.
 *
 * Idempotent and safe to call speculatively — `persistTokens` calls it on
 * every grant where a purge is outstanding, which is how tiers 2 and 3 get
 * retried.
 */
export async function purgeCharacterCacheOrSuppress(
  characterId: number
): Promise<CachePurgeOutcome> {
  if (characterId === GLOBAL_CACHE_CHARACTER_ID) return 'targeted';

  let outcome: CachePurgeOutcome = 'targeted';
  try {
    await purgeCharacterCache(characterId);
  } catch {
    try {
      // Tier 2: everything, global rows included. Correctness over churn —
      // `esiCache` is 100% re-derivable from ESI.
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
