/**
 * Shared ESI read-through cache: try live `esiFetch`, persist to the generic
 * `esiCache` Dexie table on success, fall back to whatever is cached on
 * failure. Never throws for "no network" — `null` means neither a live
 * response nor a cached one. One implementation for every `features/*` data
 * module (docs/ARCHITECTURE.md §3).
 */
import { db } from '@/db';
import { emitEsiAuthFailure } from './authFailureSignal';
import { isAuthFailure } from './client';
import { isCachePurgePending } from './cachePurge';
import type { TruncatableResult } from './paginated';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
  /**
   * The list is missing pages. Stored on the row so it survives a cache hit —
   * a short list must not look whole after a reload.
   */
  truncated: boolean;
}

/** Distinguishes "needs re-login" from "offline" (see loadWithCacheStatus). */
export interface StatusResult<T> {
  cached: CachedResult<T> | null;
  /** True when the live call failed with 401/403 (or refresh itself failed): re-login is the fix, not a refresh. */
  needsReauth: boolean;
}

/**
 * `esiCache` is keyed by [characterId, key]; character-independent public
 * lookups (universe types/names, stations) share this sentinel row rather than
 * one row per character.
 */
export const GLOBAL_CACHE_CHARACTER_ID = 0;

/**
 * Marks a cache row as owned by a *corporation* rather than by the character
 * whose token fetched it. Read by `cachePurge.purgeCorpScopedCache`, which
 * range-deletes exactly this prefix when a character changes corp — see there
 * for why the range cannot spill onto a key that merely starts with the same
 * letters, such as `corporation-history`.
 */
export const CORP_CACHE_KEY_PREFIX = 'corp:';

/**
 * Cache key for corp-owned data (issue #293).
 *
 * `esiCache` is keyed `[characterId, key]`, which can express "this
 * character's skills" but not "this corporation's structures, as read by this
 * character". Folding the corporation id into the key closes that gap twice
 * over:
 *
 * - **A cross-corp read of a corp key is impossible by construction, not by
 *   convention.** The corp id is a required argument, so a read after a corp
 *   change computes a *different* key and misses. There is no window in which
 *   the old corp's rows can be served under the new one — not even if the
 *   purge fails. (What stays a convention is that corp-owned endpoints call
 *   this at all; one that filed corp data under a bare key would simply be
 *   re-creating the defect. The endpoints land in #294-296.)
 * - **The rows are identifiable.** A corp change purges the `corp:` prefix and
 *   leaves skills, mail and wallet exactly where they are.
 *
 * The character id stays the row's first key component: consent to read corp
 * data comes from *that character's* token, so the rows must still vanish when
 * that character's grant or owner changes.
 */
export function corpCacheKey(corporationId: number, key: string): string {
  return `${CORP_CACHE_KEY_PREFIX}${corporationId}:${key}`;
}

/**
 * Written by `fetchLive` itself, right after a successful live call, with
 * ESI's raw `Expires` header (or null). `loadWithCacheStatus` and
 * `loadPaginatedWithCacheStatus` both read it back once `fetchLive` resolves
 * and use it to size that row's freshness window — this is how the window
 * reflects what that specific response declared rather than a guessed
 * constant. A plain shared box rather than widening `fetchLive`'s return
 * type: only the handful of callers that opt in via `expiresCapture` need to
 * touch this; every other caller's `fetchLive` keeps returning bare `T | null`
 * (or `TruncatableResult<T>`).
 */
export interface ExpiresCapture {
  value: string | null;
}

/**
 * How long a cached row is served without a live call. The window is a floor,
 * not a ceiling: `readFreshRow` takes whichever is later, this or ESI's own
 * `Expires` (issue #221 / CONTEXT.md round 25) — so an endpoint ESI caches for
 * an hour keeps that hour, while one it caches for 60s still holds for the
 * full 10 minutes the app promises.
 */
export const STALE_AFTER = {
  /**
   * A Character's own mutable data — skills, wallet, assets, orders, jobs,
   * mail, colonies. Ten minutes is the app-wide promise: page-to-page
   * navigation inside it never touches the network.
   */
  default: 10 * 60_000,
  /**
   * Data that does not meaningfully change: universe types, stations, systems,
   * routes, PI schematics and planet names, a delivered mail's body, an issued
   * contract's item list. Refetching these on a 10-minute cadence would spend
   * most of the prefetch budget re-learning constants.
   */
  static: 24 * 60 * 60_000,
} as const;

/**
 * How long after `invalidateFreshness()` a stale-at-that-instant row stays
 * ineligible for a freshness hit.
 *
 * The invalidation signal is global (one module-level timestamp), which was
 * harmless when exactly one key had a window. Now that every key does, an
 * unbounded signal would mean one Refresh click on Wallet sends the next visit
 * to Assets, Mail, Contracts and Orders all back to the network — defeating
 * the caching this exists to provide. Bounding it confines the bypass to the
 * reload the user actually asked for, which runs immediately after the click.
 */
export const REFRESH_BYPASS_MS = 30_000;

export interface LoadWithCacheStatusOptions {
  /**
   * Defaults to `isAuthFailure` (401/403 EsiError, or a failed refresh).
   * Override to narrow: industry/jobs.ts counts only 403, treating a 401 as a
   * generic offline-style failure.
   */
  detectAuthFailure?: (err: unknown) => boolean;
  /**
   * Skip the cache fallback read on an auth failure. For an endpoint gated by
   * a scope added after some characters already logged in (e.g. industry
   * jobs), a character that never granted it has nothing cached to fall back
   * to.
   */
  skipCacheOnAuthFailure?: boolean;
  /** See `ExpiresCapture`. Optional — the window no longer depends on it. */
  expiresCapture?: ExpiresCapture;
  /** Freshness window for this key; see `STALE_AFTER`. Defaults to `STALE_AFTER.default`. */
  staleAfterMs?: number;
}

/**
 * Epoch ms of the last `invalidateFreshness()` call. A row is only eligible
 * for a freshness-window skip if it was fetched at or after this instant, and
 * only for `REFRESH_BYPASS_MS` afterwards — so a manual refresh (which calls
 * `invalidateFreshness()` first) always forces a live call for whatever it's
 * about to reload, without threading a "force" flag through every loader and
 * route, and without sending every *other* route back to the network too.
 */
let freshnessInvalidatedAt = 0;

/**
 * Call before a manual refresh re-runs its loader(s), so the freshness window
 * never holds back a user-requested reload. Global and coarse on purpose: a
 * per-key flag threaded through every route would cost a lot more surface area
 * for the same guarantee. `REFRESH_BYPASS_MS` is what keeps that coarseness
 * affordable now that every key has a window.
 */
export function invalidateFreshness(): void {
  freshnessInvalidatedAt = Date.now();
}

/**
 * Whether a manual refresh should force this row live rather than serve it.
 *
 * Two bounds on what one Refresh click reaches, both because the invalidation
 * signal is a single global timestamp:
 *
 * - **In time.** Only for `REFRESH_BYPASS_MS`, so the click does not also send
 *   the next visit to every unrelated route back to the network.
 * - **In kind.** Only keys on the default window. A Refresh means "re-read my
 *   data", not "re-read the star map": Assets alone resolves a station,
 *   structure or system name per distinct location, and refetching those would
 *   turn one click into a fan-out over data that cannot have changed. The
 *   `STALE_AFTER.static` loaders are exactly the ones that hold game
 *   constants, so the window length is already the right discriminator — no
 *   second flag to keep in step with it.
 */
function isRefreshInvalidated(fetchedAt: number, staleAfterMs: number, now: number): boolean {
  if (staleAfterMs > STALE_AFTER.default) return false;
  // <=, not <: a manual refresh calling invalidateFreshness() right after a
  // fetch that landed in the same millisecond must still force the next call
  // live, not read the row it just invalidated as still-fresh.
  return fetchedAt <= freshnessInvalidatedAt && now - freshnessInvalidatedAt <= REFRESH_BYPASS_MS;
}

function parseExpiresHeader(expires: string | null | undefined): number | undefined {
  if (!expires) return undefined;
  const ms = Date.parse(expires);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * One shared map for both the singular and paginated read-through paths:
 * concurrent identical reads (same characterId + key) collapse onto the one
 * in-flight promise instead of racing separate ESI calls. Deleted in a
 * `finally` so a rejection never poisons the entry for the next call.
 */
const inFlightLoads = new Map<string, Promise<unknown>>();

function dedupeKey(characterId: number, key: string): string {
  return `${characterId}:${key}`;
}

/**
 * Collapses concurrent identical reads onto one in-flight promise. The single
 * shared `inFlightLoads` map serves both `T` (singular) and `T[]` (paginated)
 * callers, so the cast on a dedupe hit is unavoidable without two maps; this
 * is the one place it happens rather than one per caller.
 */
async function withDedupe<R>(characterId: number, key: string, run: () => Promise<R>): Promise<R> {
  const dkey = dedupeKey(characterId, key);
  const existing = inFlightLoads.get(dkey);
  if (existing) return existing as Promise<R>;

  const promise = run();
  inFlightLoads.set(dkey, promise);
  try {
    return await promise;
  } finally {
    inFlightLoads.delete(dkey);
  }
}

// ---------------------------------------------------------------------------
// Stale-while-revalidate
// ---------------------------------------------------------------------------

/**
 * Listeners notified after a background revalidation settles, so a mounted
 * route can silently re-read what it already rendered. One signal for every
 * key, carrying nothing: a listener's job is to re-run its own loader, not to
 * work out which of its keys moved.
 *
 * Same one-way shape as `activityLog.ts` — `esi` publishes, the React layer
 * (`lib/useRouteSnapshot.ts`) subscribes, and `esi` gains no dependency on it.
 */
type RevalidatedListener = () => void;
const revalidatedListeners = new Set<RevalidatedListener>();

export function onCacheRevalidated(listener: RevalidatedListener): () => void {
  revalidatedListeners.add(listener);
  return () => revalidatedListeners.delete(listener);
}

function emitCacheRevalidated(): void {
  for (const listener of revalidatedListeners) listener();
}

/**
 * How a key's background revalidation last failed, keyed exactly as
 * `inFlightLoads` is (`dedupeKey`) so one character's failure cannot suppress
 * another's retry.
 *
 * Serving a stale row instantly is only honest if a *failed* revalidation
 * eventually says so. It does: the failure is recorded here, the signal fires
 * anyway, the route re-reads, and this map is what makes that second read
 * carry the bad news the optimistic first read had none of — the offline
 * banner via `fromCache`, or the re-login one via `needsReauth`. Cleared on
 * success, so a key that recovers stops carrying its old failure.
 */
interface RevalidationFailure {
  at: number;
  /** The live call answered 401/403 (or the refresh itself failed). */
  needsReauth: boolean;
}
const revalidationFailures = new Map<string, RevalidationFailure>();

/**
 * A failed revalidation is not retried until the row would have gone stale
 * again anyway. Reusing the window rather than inventing a second constant:
 * retrying sooner cannot produce a fresher row than waiting would, and the
 * user's way out of a persistent failure is Refresh, which bypasses all of
 * this via `invalidateFreshness()`.
 */
function recentRevalidationFailure(dkey: string, now: number): RevalidationFailure | undefined {
  const failure = revalidationFailures.get(dkey);
  if (failure === undefined) return undefined;
  return now - failure.at < STALE_AFTER.default ? failure : undefined;
}

/**
 * How long a lapsed row's own refresh is given to answer before the stored row
 * is shown instead.
 *
 * The defect this closes is *slowness*, not staleness: offline fails fast, so
 * the cache fallback was already quick, but a slow or hanging connection left
 * every page past its window sitting on a spinner over perfectly good local
 * data — `esiFetch` has no timeout. Racing rather than serving stale
 * unconditionally is deliberate: on a healthy connection the live call wins
 * comfortably, so the page shows *fresh* data with no stale-then-swap flash,
 * and every caller keeps the exact `needsReauth` /`skipCacheOnAuthFailure`
 * semantics it had before. A quarter second is under the threshold where a
 * spinner would have appeared anyway.
 */
export const STALE_GRACE_MS = 250;

/** Race marker; a value no live result can be. */
const GRACE = Symbol('grace');

/**
 * The past-the-window path: run the live call, but do not let it hold the view
 * hostage.
 *
 * Falls back to a plain await — the pre-existing behaviour, unchanged — for
 * the two cases a stale row must not be substituted into:
 * - **A manual Refresh** (`isRefreshInvalidated`). The user asked for new data
 *   and is watching the button; it must report what actually happened.
 * - **`STALE_AFTER.static` keys.** A lapsed 24h row is a station name; a
 *   re-render per distinct location for data that cannot have changed is all
 *   cost.
 */
async function loadPastWindow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  runLive: () => Promise<StatusResult<T>>
): Promise<StatusResult<T>> {
  if (staleAfterMs > STALE_AFTER.default) return withDedupe(characterId, key, runLive);

  const dkey = dedupeKey(characterId, key);
  const held = await heldAfterFailure<T>(characterId, key, staleAfterMs, options, dkey);
  if (held) return held;

  const live = withDedupe(characterId, key, runLive);
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<typeof GRACE>((resolve) => {
    graceTimer = setTimeout(() => resolve(GRACE), STALE_GRACE_MS);
  });
  // Settled first so the grace branch cannot leave a rejection unhandled.
  const settled = live.then(
    (result) => ({ ok: true as const, result }),
    (error) => ({ ok: false as const, error })
  );

  const winner = await Promise.race([settled, grace]);
  if (winner !== GRACE) {
    // A timer left running keeps the jsdom test environment alive past the test.
    clearTimeout(graceTimer);
    if (!winner.ok) throw winner.error;
    if (succeededLive(winner.result)) revalidationFailures.delete(dkey);
    return winner.result;
  }

  const stale = await readStaleRow<T>(characterId, key, staleAfterMs);
  if (!stale) {
    // Nothing to show in the meantime, so there is no choice but to wait.
    const outcome = await settled;
    if (!outcome.ok) throw outcome.error;
    return outcome.result;
  }

  void recordLateOutcome(dkey, settled);
  // No bad news yet, so the row reads as current and no view raises its
  // offline banner. `heldAfterFailure` is what corrects that if the call the
  // view is no longer waiting on turns out to have failed.
  return { cached: stale, needsReauth: false };
}

/** True when a live result carries a response, rather than a fallback to the cached row. */
function succeededLive(result: { cached: { fromCache: boolean } | null }): boolean {
  return result.cached !== null && !result.cached.fromCache;
}

/**
 * Records how a call the view stopped waiting on turned out, then wakes any
 * mounted route to re-read. Never rejects.
 */
async function recordLateOutcome<T>(
  dkey: string,
  settled: Promise<{ ok: true; result: StatusResult<T> } | { ok: false; error: unknown }>
): Promise<void> {
  const outcome = await settled;
  if (outcome.ok && succeededLive(outcome.result)) {
    revalidationFailures.delete(dkey);
  } else {
    revalidationFailures.set(dkey, {
      at: Date.now(),
      needsReauth: outcome.ok && outcome.result.needsReauth,
    });
  }
  emitCacheRevalidated();
}

/**
 * The result to serve when the previous grace-path call failed, or `null` to
 * go to the network as usual.
 *
 * This is what stops the signal looping. Without it the re-read that a failed
 * late call provokes would start another slow call, serve stale again at the
 * grace mark, fail again, and signal again. It is also where the bad news the
 * optimistic read withheld finally lands: the offline banner via `fromCache`,
 * the re-login prompt via `needsReauth`, and `cached: null` for the two
 * loaders that opted out of stale-on-auth-failure (industry jobs, PI) and must
 * not be handed a row the character may no longer be entitled to.
 */
async function heldAfterFailure<T>(
  characterId: number,
  key: string,
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  dkey: string
): Promise<StatusResult<T> | null> {
  const failure = recentRevalidationFailure(dkey, Date.now());
  if (!failure) return null;
  if (failure.needsReauth && options.skipCacheOnAuthFailure) {
    return { cached: null, needsReauth: true };
  }
  const stale = await readStaleRow<T>(characterId, key, staleAfterMs);
  if (!stale) return null;
  return { cached: { ...stale, fromCache: true }, needsReauth: failure.needsReauth };
}

/** The stored row, or `null` when there is none or a manual Refresh forbids substituting it. */
async function readStaleRow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number
): Promise<CachedResult<T> | null> {
  const row = await readCachedRow(characterId, key);
  if (!row) return null;
  if (isRefreshInvalidated(row.fetchedAt, staleAfterMs, Date.now())) return null;
  return {
    data: row.value as T,
    fetchedAt: new Date(row.fetchedAt),
    truncated: row.truncated === true,
    fromCache: false,
  };
}

/**
 * Test seam: drops the failed-revalidation backoff so one test's offline key
 * cannot suppress the next test's retry. Module state otherwise outlives a
 * `beforeEach` that only clears Dexie.
 */
export function resetRevalidationState(): void {
  revalidationFailures.clear();
}

/**
 * Like `loadWithCache`, but surfaces an auth failure (401 expired token, 403
 * missing scope, failed refresh) as `needsReauth` instead of silently falling
 * back. Any other failure (offline, 5xx, timeout) still falls through.
 *
 * `needsReauth` never short-circuits the cache read by default: a caller on
 * `loadWithCache`, which reads only `.cached`, must not regress from
 * stale-but-present to null because a status-aware sibling exists.
 */
export async function loadWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadWithCacheStatusOptions = {}
): Promise<StatusResult<T>> {
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER.default;
  const fresh = await readFreshRow<T>(characterId, key, staleAfterMs);
  if (fresh) return { cached: fresh, needsReauth: false };

  return loadPastWindow<T>(characterId, key, staleAfterMs, options, () =>
    loadWithCacheStatusLive(characterId, key, fetchLive, options)
  );
}

async function loadWithCacheStatusLive<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadWithCacheStatusOptions
): Promise<StatusResult<T>> {
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  let needsReauth = false;
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      const expiresAt = parseExpiresHeader(options.expiresCapture?.value);
      await db.esiCache.put({
        characterId,
        key,
        value: data,
        fetchedAt,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false, truncated: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    if (detectAuthFailure(err)) {
      needsReauth = true;
      // The shell renders one notice (src/app/Layout.tsx). Covers the window
      // the route scope gate cannot: a revoke done in EVE's third-party-app
      // portal is invisible locally until the next token refresh, so the
      // stored grant still looks complete.
      emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await readCachedRow(characterId, key);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: {
      data: cached.value as T,
      fetchedAt: new Date(cached.fetchedAt),
      fromCache: true,
      truncated: cached.truncated === true,
    },
    needsReauth,
  };
}

/**
 * A row still inside its freshness window — served without a live call.
 *
 * The window is `max(the row's own Expires, fetchedAt + staleAfterMs)`: the
 * TTL is a floor every key gets, and ESI's header only ever extends it. Before
 * issue #221 the header was the whole mechanism, so a key whose loader did not
 * opt into `expiresCapture` had no window at all.
 *
 * `fromCache` is `false` here: this is a successful, on-time read, not the
 * degraded "live call failed, fell back to a stale row" case that flag
 * otherwise means, and views use it to decide whether to show an offline banner.
 */
async function readFreshRow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number
): Promise<CachedResult<T> | null> {
  const row = await readCachedRow(characterId, key);
  if (!row) return null;
  const now = Date.now();
  if (Math.max(row.expiresAt ?? 0, row.fetchedAt + staleAfterMs) <= now) return null;
  if (isRefreshInvalidated(row.fetchedAt, staleAfterMs, now)) return null;
  return {
    data: row.value as T,
    fetchedAt: new Date(row.fetchedAt),
    fromCache: false,
    truncated: row.truncated === true,
  };
}

/** ESI or cache, dropping the auth-failure distinction for callers that don't need it. */
export async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadWithCacheStatusOptions = {}
): Promise<CachedResult<T> | null> {
  return (await loadWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

/**
 * Read-through for a paginated list, where a fetch can come back short.
 *
 * Enforced, not an option: a partial list may not overwrite a complete one —
 * an older complete list under an honest Data Age beats a fresh list that
 * silently lost a page. A partial IS stored when nothing is cached, or when
 * the cached row is itself partial; refusing outright would leave the cache
 * permanently cold for an endpoint that truncates every time, like the wallet
 * transactions page cap.
 *
 * The only cache entry points accepting a `TruncatableResult`, so a caller
 * cannot silently drop the flag. Like `loadWithCacheStatus`, the `...Status`
 * variant reports an auth failure as `needsReauth` rather than a silent
 * fallback.
 */
export async function loadPaginatedWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadWithCacheStatusOptions = {}
): Promise<StatusResult<T[]>> {
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER.default;
  const fresh = await readFreshRow<T[]>(characterId, key, staleAfterMs);
  if (fresh) return { cached: fresh, needsReauth: false };

  return loadPastWindow<T[]>(characterId, key, staleAfterMs, options, () =>
    loadPaginatedWithCacheStatusLive(characterId, key, fetchLive, options)
  );
}

async function loadPaginatedWithCacheStatusLive<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadWithCacheStatusOptions
): Promise<StatusResult<T[]>> {
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  let needsReauth = false;
  try {
    const { items, truncated } = await fetchLive();
    const fetchedAt = Date.now();
    const existing = truncated ? await readCachedRow(characterId, key) : undefined;
    const wouldClobberCompleteList = existing !== undefined && existing.truncated !== true;
    if (!wouldClobberCompleteList) {
      const expiresAt = parseExpiresHeader(options.expiresCapture?.value);
      await db.esiCache.put({
        characterId,
        key,
        value: items,
        fetchedAt,
        truncated,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });
      return {
        cached: { data: items, fetchedAt: new Date(fetchedAt), fromCache: false, truncated },
        needsReauth: false,
      };
    }
    return {
      cached: {
        data: existing.value as T[],
        fetchedAt: new Date(existing.fetchedAt),
        fromCache: true,
        truncated: false,
      },
      needsReauth: false,
    };
  } catch (err) {
    // Offline/5xx: fall back to cache, as loadWithCacheStatus does. An auth
    // failure additionally sets needsReauth so a revoked scope offers a
    // re-login instead of a silent empty list (issue #14).
    if (detectAuthFailure(err)) {
      needsReauth = true;
      emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await readCachedRow(characterId, key);
  if (!cached) return { cached: null, needsReauth };
  return {
    cached: {
      data: cached.value as T[],
      fetchedAt: new Date(cached.fetchedAt),
      fromCache: true,
      truncated: cached.truncated === true,
    },
    needsReauth,
  };
}

/** Paginated read-through, dropping the auth-failure distinction. */
export async function loadPaginatedWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadWithCacheStatusOptions = {}
): Promise<CachedResult<T[]> | null> {
  return (await loadPaginatedWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

/**
 * The single point where a cached row is allowed to reach a caller.
 *
 * A character whose purge is still pending has rows we could not delete and
 * are not allowed to serve, so its cache reads as empty (`cachePurge.ts`).
 * One in-memory lookup per read, not per row. Writes are deliberately left
 * alone — new rows are the *current* owner's data, and the pending purge
 * sweeps them when it succeeds.
 */
async function readCachedRow(
  characterId: number,
  key: string
): Promise<
  { value: unknown; fetchedAt: number; truncated?: boolean; expiresAt?: number } | undefined
> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCache.get([characterId, key]);
}

/**
 * Same gate as `readCachedRow`, for one key across many characters. Lives
 * here so the D1 purge check has exactly one implementation — a caller doing
 * its own `bulkGet` would bypass it and serve a previous owner's rows.
 *
 * Returns a map so an absent character is distinguishable from one whose
 * cached value is itself empty. The purge check runs *after* the read: a
 * purge that becomes pending mid-batch still suppresses the row.
 */
export async function readCachedRows<T>(
  characterIds: readonly number[],
  key: string
): Promise<Map<number, CachedResult<T>>> {
  const found = new Map<number, CachedResult<T>>();
  if (characterIds.length === 0) return found;

  const rows = await db.esiCache.bulkGet(characterIds.map((id): [number, string] => [id, key]));
  const suppressed = await Promise.all(characterIds.map((id) => isCachePurgePending(id)));

  rows.forEach((row, i) => {
    if (!row || suppressed[i]) return;
    found.set(characterIds[i], {
      data: row.value as T,
      fetchedAt: new Date(row.fetchedAt),
      fromCache: true,
      truncated: row.truncated === true,
    });
  });
  return found;
}

/** Raw cache read, for callers doing their own batch/partial-resolution (names.ts, typeNames.ts). */
export async function readCached<T>(characterId: number, key: string): Promise<T | undefined> {
  const row = await readCachedRow(characterId, key);
  return row?.value as T | undefined;
}

/** Raw cache write; `fetchedAt` is a parameter so a caller stamping a whole batch uses one timestamp. */
export async function writeCached<T>(
  characterId: number,
  key: string,
  value: T,
  fetchedAt: number
): Promise<void> {
  await db.esiCache.put({ characterId, key, value, fetchedAt });
}
