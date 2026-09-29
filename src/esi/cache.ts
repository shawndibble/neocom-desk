/**
 * Shared ESI read-through cache: try live `esiFetch`, persist to the generic
 * `esiCache` Dexie table on success, fall back to whatever is cached on
 * failure. Never throws for "no network" — `null` means neither a live
 * response nor a cached one. One implementation for every `features/*` data
 * module (docs/ARCHITECTURE.md §3).
 */
import { db, type CachedPage, type EsiCacheMetaRecord, type EsiCacheRecord } from '@/db';
import { metaOf } from '@/db/esiCacheMeta';
import { emitEsiAuthFailure } from './authFailureSignal';
import { EsiError, EsiTimeoutError, isAuthFailure, type EsiResult } from './client';
import { isCachePurgePending } from './cachePurge';
import { promoteEsiLane } from './budget';
import { laneForLoad, withEsiLane, type EsiLane } from './lane';
import { grantHoldsEndpointScope } from './grantScope';
import type { PageResponse, PaginatedResult, TruncatableResult } from './paginated';

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
 * Prefix for `features/character/structures.ts`'s cache keys — both its
 * per-character rows (`structure:{id}`, `structure:{id}:forbidden`) and,
 * since issue #669, the rows it mirrors under `GLOBAL_CACHE_CHARACTER_ID`
 * once any Character in the roster resolves or exhausts a citadel
 * (`structure:{id}`, `structure:{id}:roster-forbidden`).
 *
 * Defined here, not in `structures.ts`, so `cachePurge.purgeSharedStructureCache`
 * can range-delete exactly this prefix under the sentinel without `src/esi`
 * (lower-level than `src/features`, per docs/ARCHITECTURE.md) importing back
 * from a feature module. A structure's visibility is genuinely ACL-gated, so
 * unlike the truly public rows this sentinel otherwise holds (universe
 * types/names, stations), these have exactly one purge path — the whole
 * roster being cleared — rather than none; see `purgeSharedStructureCache`.
 */
export const STRUCTURE_CACHE_KEY_PREFIX = 'structure:';

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
 * The two-way box for an ETag revalidation, shaped like `ExpiresCapture`:
 * the cache fills `ifNoneMatch` from the stored row before `fetchLive` runs,
 * and `fetchLive` reports the response back. Build it with `conditionalFetch`
 * rather than by hand.
 *
 * A 304 then costs a bump of the row's freshness in `esiCacheMeta` — no body
 * download, no JSON parse, and no rewrite of a value that did not change.
 * Single-response loaders only (`loadWithCache[Status]`): a paginated list's
 * page-1 304 says nothing about pages 2..N — see `PagedConditionalCapture`.
 */
export interface ConditionalCapture {
  /** Set by the cache: the stored row's ETag, or undefined to fetch unconditionally. */
  ifNoneMatch: string | undefined;
  /** Set by `fetchLive`: the response's ETag. */
  etag: string | null;
  /** Set by `fetchLive`: the response's raw `Expires`, sizing the row's window. */
  expires: string | null;
  /** Set by `fetchLive`: the server answered 304 to `ifNoneMatch`. */
  notModified: boolean;
}

/**
 * A `fetchLive` that revalidates with If-None-Match, plus the capture to pass
 * as `conditional`:
 *
 *     const { fetchLive, conditional } = conditionalFetch((o) => getX(id, o));
 *     return loadWithCache(id, KEY, fetchLive, { conditional });
 *
 * Only for a loader whose cached value is the endpoint's `data` as-is — a 304
 * answers for the response, so a value derived from anything else would be
 * vouched for by a header that never saw it.
 */
export function conditionalFetch<T>(fetch: (options: { etag?: string }) => Promise<EsiResult<T>>): {
  fetchLive: () => Promise<T | null>;
  conditional: ConditionalCapture;
} {
  const conditional: ConditionalCapture = {
    ifNoneMatch: undefined,
    etag: null,
    expires: null,
    notModified: false,
  };
  const fetchLive = async (): Promise<T | null> => {
    const result = await fetch({ etag: conditional.ifNoneMatch });
    conditional.etag = result.etag;
    conditional.expires = result.expires;
    conditional.notModified = result.notModified;
    return result.data;
  };
  return { fetchLive, conditional };
}

/**
 * `ConditionalCapture` for a paginated list, one ETag per page: the cache fills
 * `ifNoneMatch` from the stored row's pages, and `fetchLive` reports every
 * page's answer back. Build it with `conditionalPagedFetch`.
 *
 * Every page is still requested. Only a list whose every page is a 304, with
 * the same page count as before, is left unwritten (a meta bump, as for a
 * single response); otherwise it is rebuilt from the stored items of its 304
 * pages and the fresh items of the rest.
 */
export interface PagedConditionalCapture<T> {
  /** Set by the cache: the stored per-page ETags, or undefined to fetch unconditionally. */
  ifNoneMatch: ReadonlyArray<string> | undefined;
  /** Set by `fetchLive`: what each walked page answered, entry `i` for page `i + 1`. */
  pageResponses: PageResponse<T>[] | undefined;
}

/**
 * `conditionalFetch` for a paginated list:
 *
 *     const { fetchLive, conditional } = conditionalPagedFetch((o) => getX(id, o));
 *     return loadPaginatedWithCacheStatus(id, KEY, fetchLive, { conditional });
 *
 * The same rule applies: only for a loader whose cached value is the pages'
 * items as-is.
 */
export function conditionalPagedFetch<T>(
  fetch: (options: {
    pageEtags: ReadonlyArray<string | undefined>;
  }) => Promise<TruncatableResult<T> & Pick<PaginatedResult<T>, 'pageResponses'>>
): { fetchLive: () => Promise<TruncatableResult<T>>; conditional: PagedConditionalCapture<T> } {
  const conditional: PagedConditionalCapture<T> = {
    ifNoneMatch: undefined,
    pageResponses: undefined,
  };
  const fetchLive = async (): Promise<TruncatableResult<T>> => {
    const result = await fetch({ pageEtags: conditional.ifNoneMatch ?? [] });
    conditional.pageResponses = result.pageResponses;
    return result;
  };
  return { fetchLive, conditional };
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
  /**
   * Put a long-window key on the grace race — lapsed row shown after
   * `STALE_GRACE_MS`, late result signalled — even though its window is longer
   * than `STALE_AFTER.default`. Off by default — see `loadPastWindow`: without
   * it a window between the default and `STALE_AFTER.static` blocks on the live
   * call, and a `STALE_AFTER.static` one is served stale *silently*.
   *
   * For a *published snapshot*: a payload that genuinely changes, but only on
   * a backend's own publish clock, so its long window exists to stop
   * pointless refetches rather than to assert the value is a constant. Last
   * cycle's rows are the right thing to render while this cycle's arrive; a
   * station name, by contrast, has nothing to re-render for.
   *
   * Opting in buys the whole stale-serve contract, not just the substitution:
   * the late result is written and signalled (`onCacheRevalidated`), and a
   * revalidation that *fails* comes back as `fromCache: true` on the next
   * read, so a view can say so rather than leaving a refresh unreported.
   */
  allowStaleServe?: boolean;
}

/** `loadWithCache[Status]` only — see `ConditionalCapture` for why not paginated. */
export interface LoadSingleWithCacheOptions extends LoadWithCacheStatusOptions {
  /** Revalidate with the stored ETag; see `conditionalFetch`. */
  conditional?: ConditionalCapture;
}

/** `loadPaginatedWithCache[Status]` only. */
export interface LoadPaginatedWithCacheOptions<T> extends LoadWithCacheStatusOptions {
  /** Revalidate page by page with the stored ETags; see `conditionalPagedFetch`. */
  conditional?: PagedConditionalCapture<T>;
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
 *
 * Each entry keeps the gate lane its load runs in (`lane.ts`), so a view
 * joining a load background work started can promote it.
 */
const inFlightLoads = new Map<string, { promise: Promise<unknown>; lane: EsiLane | undefined }>();

function dedupeKey(characterId: number, key: string): string {
  return `${characterId}:${key}`;
}

/**
 * Collapses concurrent identical reads onto one in-flight promise. The single
 * shared `inFlightLoads` map serves both `T` (singular) and `T[]` (paginated)
 * callers, so the cast on a dedupe hit is unavoidable without two maps; this
 * is the one place it happens rather than one per caller.
 */
async function withDedupe<R>(
  characterId: number,
  key: string,
  lane: EsiLane | undefined,
  run: () => Promise<R>
): Promise<R> {
  const dkey = dedupeKey(characterId, key);
  const existing = inFlightLoads.get(dkey);
  if (existing) {
    // A foreground caller is now waiting on a background load: what of it is
    // still queued at the gate stops queueing behind background work (#2271).
    // Never the other way — a background joiner leaves a view's load alone.
    if (lane === undefined && existing.lane !== undefined) promoteEsiLane(existing.lane);
    return existing.promise as Promise<R>;
  }

  const promise = run();
  inFlightLoads.set(dkey, { promise, lane });
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
 * Fallback results whose live call timed out still queued at the ESI gate
 * (`EsiTimeoutError.sent === false`, issue #2271). ESI was never asked, so
 * the call proves nothing about it — the app was busy, most often a
 * background load held in the low lane behind a view. Such a result is not
 * recorded as a failure: holding the key would hand the next foreground read
 * a stale row under the offline banner while ESI is healthy.
 */
const unsentResults = new WeakSet<object>();

/** A live call that timed out before its request left the gate. */
function timedOutAtGate(err: unknown): boolean {
  return err instanceof EsiTimeoutError && !err.sent;
}

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
 * data — `esiFetch`'s own `REQUEST_TIMEOUT_MS` is 30 seconds, far too long to
 * hold a page on. Racing rather than serving stale
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
 * Game constants (`STALE_AFTER.static` and longer, no opt-in) take their own
 * path, `loadLapsedConstant`: the stored row at once, refreshed silently.
 *
 * Otherwise falls back to a plain await — the pre-existing behaviour,
 * unchanged — for the two cases a stale row must not be substituted into:
 * - **A manual Refresh** (`isRefreshInvalidated`). The user asked for new data
 *   and is watching the button; it must report what actually happened. Note
 *   this only reaches keys on the default window: `isRefreshInvalidated`
 *   deliberately exempts longer ones, so a Refresh does not force a
 *   `Published Snapshot` live — there is nothing newer to fetch until the
 *   backend republishes, and `chunkedSnapshot.ts` documents that trade.
 * - **Keys whose window is longer than the default but shorter than a day.**
 *   Neither a constant nor on the default cadence, so neither substitution
 *   applies. A key whose long window is a *publish cadence* rather than a
 *   claim of immutability opts into the grace race with `allowStaleServe`.
 *   (Constants never reach the race either way: a re-render per distinct
 *   location for data that cannot have changed is all cost.)
 */
async function loadPastWindow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  read: RowReader,
  lane: EsiLane | undefined,
  runLive: () => Promise<StatusResult<T>>
): Promise<StatusResult<T>> {
  const dkey = dedupeKey(characterId, key);
  if (staleAfterMs > STALE_AFTER.default && options.allowStaleServe !== true) {
    if (staleAfterMs >= STALE_AFTER.static && options.skipCacheOnAuthFailure !== true) {
      return loadLapsedConstant(characterId, key, staleAfterMs, options, dkey, read, lane, runLive);
    }
    return withDedupe(characterId, key, lane, runLive);
  }

  const held = await heldAfterFailure<T>(staleAfterMs, options, dkey, read);
  if (held) return held;

  const live = withDedupe(characterId, key, lane, runLive);
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

  const stale = await readStaleRow<T>(read, staleAfterMs);
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

/**
 * A lapsed game constant (`STALE_AFTER.static`): serve the stored row at once
 * and refresh it behind the caller.
 *
 * Unlike the grace race there is nothing to race for — the live answer is, in
 * all but the rarest case, the value already on disk — so the stored row is
 * returned without waiting even `STALE_GRACE_MS`. That matters after a day
 * away: every station, structure, system, public-info, contract-item and
 * mail-body lookup has lapsed at once, and each used to block on ESI.
 *
 * And unlike the grace race it does **not** signal `onCacheRevalidated`. That
 * signal makes every mounted route re-run its loader; for a constant that
 * would re-render the page per distinct location to show the same name. The
 * refreshed row is simply there for the next read.
 *
 * A refresh that fails is still recorded, so `heldAfterFailure` answers the
 * next read with the row flagged `fromCache` (what the old blocking path
 * returned for a failed call) instead of starting another one straight away.
 * Loaders that opted out of stale-on-auth-failure never come here.
 */
async function loadLapsedConstant<T>(
  characterId: number,
  key: string,
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  dkey: string,
  read: RowReader,
  lane: EsiLane | undefined,
  runLive: () => Promise<StatusResult<T>>
): Promise<StatusResult<T>> {
  const held = await heldAfterFailure<T>(staleAfterMs, options, dkey, read);
  if (held) return held;

  const stale = await readStaleRow<T>(read, staleAfterMs);
  const live = withDedupe(characterId, key, lane, runLive);
  // Nothing to show in the meantime, so there is no choice but to wait.
  if (!stale) return live;

  void live.then(
    (result) => {
      if (unsentResults.has(result)) return;
      if (succeededLive(result)) revalidationFailures.delete(dkey);
      else revalidationFailures.set(dkey, { at: Date.now(), needsReauth: result.needsReauth });
    },
    () => revalidationFailures.set(dkey, { at: Date.now(), needsReauth: false })
  );
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
  // Nothing was learned, so nothing is recorded — and nothing changed to re-read.
  if (outcome.ok && unsentResults.has(outcome.result)) return;
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
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  dkey: string,
  read: RowReader
): Promise<StatusResult<T> | null> {
  const failure = recentRevalidationFailure(dkey, Date.now());
  if (!failure) return null;
  if (failure.needsReauth && options.skipCacheOnAuthFailure) {
    return { cached: null, needsReauth: true };
  }
  const stale = await readStaleRow<T>(read, staleAfterMs);
  if (!stale) return null;
  return { cached: { ...stale, fromCache: true }, needsReauth: failure.needsReauth };
}

/** The stored row, or `null` when there is none or a manual Refresh forbids substituting it. */
async function readStaleRow<T>(
  read: RowReader,
  staleAfterMs: number
): Promise<CachedResult<T> | null> {
  const row = await read();
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
  options: LoadSingleWithCacheOptions = {}
): Promise<StatusResult<T>> {
  // Before the first await, while a background caller's lane is still ambient.
  const lane = laneForLoad();
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER.default;
  const fresh = await readFreshRow<T>(characterId, key, staleAfterMs);
  if (fresh) return { cached: fresh, needsReauth: false };

  const read = rowReader(characterId, key);
  return loadPastWindow<T>(characterId, key, staleAfterMs, options, read, lane, () =>
    loadWithCacheStatusLive(characterId, key, fetchLive, options, read, lane)
  );
}

/**
 * Whether a 401/403 is worth the shell-wide re-auth notice (issue #1521).
 *
 * `emitEsiAuthFailure` exists for a scope that *was* granted going stale — a
 * revoke performed in EVE's third-party-application portal is invisible
 * locally until the next token refresh
 * (docs/context/decisions/20260831-140406-the-whole-app-sits-behind-authentication.md).
 * A route whose gated component briefly mounts before `ScopeGate` resolves
 * the active grant (`app/ScopeGate.tsx`'s documented pass-through window) can
 * fire this same 401/403 shape for a scope the stored grant never claimed at
 * all — that is not a revoke, it is the route's own gate about to correct
 * itself, and the shell notice must stay silent for it. `needsReauth` on the
 * result is unaffected either way: the caller's own banner is the right
 * signal for "not granted", this only gates the *second*, shell-wide one.
 *
 * `AuthError` (the refresh grant itself failing) has no single endpoint to
 * check and is always worth reporting — it means nothing this Character
 * holds can be trusted, not that one scope is missing.
 */
async function isWorthReportingToShell(characterId: number, err: unknown): Promise<boolean> {
  if (!(err instanceof EsiError) || err.endpointId === undefined) return true;
  return grantHoldsEndpointScope(characterId, err.endpointId);
}

async function loadWithCacheStatusLive<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadSingleWithCacheOptions,
  read: RowReader,
  lane: EsiLane | undefined
): Promise<StatusResult<T>> {
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  const { conditional } = options;
  let needsReauth = false;
  let unsent = false;
  try {
    if (conditional) conditional.ifNoneMatch = await revalidationEtag(characterId, key);
    // Every `fetchLive()` runs in this load's lane, past the awaits above.
    let data = await withEsiLane(lane, fetchLive);
    if (conditional?.notModified) {
      const revalidated = await applyNotModified<T>(
        characterId,
        key,
        conditional.ifNoneMatch,
        conditional.expires
      );
      if (revalidated) return { cached: revalidated, needsReauth: false };
      // The row the ETag vouched for changed or vanished in the meantime, so
      // there is nothing for the 304 to point at: ask again, unconditionally.
      conditional.ifNoneMatch = undefined;
      data = await withEsiLane(lane, fetchLive);
    }
    if (data !== null && conditional?.notModified !== true) {
      const fetchedAt = Date.now();
      const expiresAt = parseExpiresHeader(conditional?.expires ?? options.expiresCapture?.value);
      const etag = conditional?.etag ?? undefined;
      // `esiCacheMeta` is written in the same transaction by the db middleware.
      await db.esiCache.put({
        characterId,
        key,
        value: data,
        fetchedAt,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(etag !== undefined ? { etag } : {}),
      });
      return {
        cached: { data, fetchedAt: new Date(fetchedAt), fromCache: false, truncated: false },
        needsReauth: false,
      };
    }
  } catch (err) {
    unsent = timedOutAtGate(err);
    if (detectAuthFailure(err)) {
      needsReauth = true;
      // The shell renders one notice (src/app/Layout.tsx). Covers the window
      // the route scope gate cannot: a revoke done in EVE's third-party-app
      // portal is invisible locally until the next token refresh, so the
      // stored grant still looks complete. Gated by isWorthReportingToShell
      // (issue #1521) so a scope never granted at all — the common case a
      // route's own ScopeGate/banner already communicates — does not also
      // paint the shell-wide notice.
      if (await isWorthReportingToShell(characterId, err)) emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await read();
  const fallback: StatusResult<T> = cached
    ? {
        cached: {
          data: cached.value as T,
          fetchedAt: new Date(cached.fetchedAt),
          fromCache: true,
          truncated: cached.truncated,
        },
        needsReauth,
      }
    : { cached: null, needsReauth };
  if (unsent) unsentResults.add(fallback);
  return fallback;
}

/** The stored ETag worth sending as If-None-Match, if any. Reads meta only. */
async function revalidationEtag(characterId: number, key: string): Promise<string | undefined> {
  const meta = await readMeta(characterId, key);
  // A partial list's ETag would vouch only for the part we hold.
  return meta && meta.truncated !== true ? meta.etag : undefined;
}

/**
 * Apply a 304: the stored value is still current, so push its freshness
 * forward in `esiCacheMeta` alone and hand back the value as it stands. The
 * value row is read (the caller needs the data) but never rewritten — no
 * serialize, no multi-megabyte write for a payload that did not change.
 *
 * `null` when the stored row is no longer the one the ETag vouched for — gone
 * (purged, cleared) or rewritten under another ETag — in which case the 304
 * points at nothing we hold and the caller must refetch.
 */
async function applyNotModified<T>(
  characterId: number,
  key: string,
  sent: string | undefined,
  expires: string | null
): Promise<CachedResult<T> | null> {
  if (sent === undefined || (await isCachePurgePending(characterId))) return null;
  const now = Date.now();
  const expiresAt = parseExpiresHeader(expires);
  return db.transaction('rw', db.esiCache, db.esiCacheMeta, async () => {
    const meta = await db.esiCacheMeta.get([characterId, key]);
    if (meta?.etag !== sent) return null;
    const row = await db.esiCache.get([characterId, key]);
    if (row?.etag !== sent) return null;
    const bumped: EsiCacheMetaRecord = { ...meta, fetchedAt: now };
    if (expiresAt !== undefined) bumped.expiresAt = expiresAt;
    else delete bumped.expiresAt;
    await db.esiCacheMeta.put(bumped);
    return {
      data: row.value as T,
      fetchedAt: new Date(now),
      fromCache: false,
      truncated: row.truncated === true,
    };
  });
}

/**
 * Whether a row is inside its freshness window.
 *
 * The window is `max(the row's own Expires, fetchedAt + staleAfterMs)`: the
 * TTL is a floor every key gets, and ESI's header only ever extends it. Before
 * issue #221 the header was the whole mechanism, so a key whose loader did not
 * opt into `expiresCapture` had no window at all.
 */
function isWithinWindow(meta: EsiCacheMetaRecord, staleAfterMs: number, now: number): boolean {
  if (Math.max(meta.expiresAt ?? 0, meta.fetchedAt + staleAfterMs) <= now) return false;
  return !isRefreshInvalidated(meta.fetchedAt, staleAfterMs, now);
}

/**
 * A row still inside its freshness window — served without a live call.
 *
 * Decided from `esiCacheMeta` alone, so a row past its window costs no
 * deserialization of a value that is about to be replaced; the value is read
 * only for a hit.
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
  const found = await readMetaOrRow(characterId, key);
  if (!found) return null;
  const { meta } = found;
  if (!isWithinWindow(meta, staleAfterMs, Date.now())) return null;
  const row = found.row ?? (await db.esiCache.get([characterId, key]));
  if (!row) {
    void dropOrphanMeta(characterId, key);
    return null;
  }
  // Meta that does not describe this row — rewritten behind the middleware's
  // back (raw IndexedDB, a bundle from before it) — has no say: the row's own
  // age decides, and meta is realigned to it.
  const own = metaVouchesFor(meta, row) ? meta : metaOf(row);
  if (own !== meta) {
    void realignMeta(row, meta);
    if (!isWithinWindow(own, staleAfterMs, Date.now())) return null;
  }
  return {
    data: row.value as T,
    fetchedAt: new Date(own.fetchedAt),
    fromCache: false,
    truncated: own.truncated === true,
  };
}

/**
 * Whether meta speaks for this value row: written with it (same `fetchedAt`),
 * or moved forward since by a 304 that named the row's own ETag.
 */
function metaVouchesFor(
  meta: EsiCacheMetaRecord,
  row: Pick<EsiCacheRecord, 'fetchedAt' | 'etag'>
): boolean {
  if (meta.fetchedAt === row.fetchedAt) return true;
  return row.etag !== undefined && meta.etag === row.etag && meta.fetchedAt > row.fetchedAt;
}

/**
 * When a stored value was last confirmed current: a 304 moves meta's
 * `fetchedAt` forward without rewriting the value, so every reader that
 * reports a row's age — not just the loaders — takes the later of the two
 * while meta vouches for the row.
 */
function effectiveFetchedAt(
  meta: EsiCacheMetaRecord | undefined,
  row: Pick<EsiCacheRecord, 'fetchedAt' | 'etag'>
): number {
  return meta !== undefined && metaVouchesFor(meta, row)
    ? Math.max(meta.fetchedAt, row.fetchedAt)
    : row.fetchedAt;
}

/**
 * Whether a key's cached row is inside its freshness window, without reading
 * its value — the same verdict the loaders reach, for a caller that only wants
 * to know whether calling one would touch the network (the boot prefetch).
 *
 * `false` whenever that is not certain: no row, a row from before
 * `esiCacheMeta` existed (the loader will read it and backfill), a purge
 * pending, or meta whose value is somehow missing — a skip must never leave a
 * key cold.
 *
 * Unlike `readFreshRow` it cannot check that meta still describes the value
 * row (`metaVouchesFor` needs the row's `fetchedAt`, i.e. a value read). A
 * row rewritten behind the middleware's back can therefore look fresh here;
 * the only cost is one skipped warm-up, since the route's own load reads the
 * row and judges it by its own age.
 */
export async function isCacheFresh(
  characterId: number,
  key: string,
  staleAfterMs: number = STALE_AFTER.default
): Promise<boolean> {
  try {
    const meta = await readMeta(characterId, key);
    if (!meta || !isWithinWindow(meta, staleAfterMs, Date.now())) return false;
    return await hasValueRow([characterId, key]);
  } catch {
    // Unsure is "not fresh": the caller then runs the loader, which has its
    // own failure handling.
    return false;
  }
}

/** Primary-key count: "is the value there?" without deserializing it. */
async function hasValueRow(id: [number, string]): Promise<boolean> {
  return (await db.esiCache.where(':id').equals(id).count()) > 0;
}

/** ESI or cache, dropping the auth-failure distinction for callers that don't need it. */
export async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadSingleWithCacheOptions = {}
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
  options: LoadPaginatedWithCacheOptions<T> = {}
): Promise<StatusResult<T[]>> {
  // Before the first await, while a background caller's lane is still ambient.
  const lane = laneForLoad();
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER.default;
  const fresh = await readFreshRow<T[]>(characterId, key, staleAfterMs);
  if (fresh) return { cached: fresh, needsReauth: false };

  const read = rowReader(characterId, key);
  return loadPastWindow<T[]>(characterId, key, staleAfterMs, options, read, lane, () =>
    loadPaginatedWithCacheStatusLive(characterId, key, fetchLive, options, read, lane)
  );
}

async function loadPaginatedWithCacheStatusLive<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadPaginatedWithCacheOptions<T>,
  read: RowReader,
  lane: EsiLane | undefined
): Promise<StatusResult<T[]>> {
  const detectAuthFailure = options.detectAuthFailure ?? isAuthFailure;
  const { conditional } = options;
  let needsReauth = false;
  let unsent: boolean;
  try {
    const stored = conditional ? await revalidationPages(characterId, key) : undefined;
    if (conditional) conditional.ifNoneMatch = stored?.map((page) => page.etag);
    // Every `fetchLive()` runs in this load's lane, past the awaits above.
    let live = await withEsiLane(lane, fetchLive);
    let revalidated =
      stored && conditional
        ? await revalidatePages<T>(characterId, key, stored, conditional, live, options)
        : undefined;
    if (revalidated === null && conditional) {
      // The row the ETags vouched for changed or vanished in the meantime, so
      // there is nothing for a 304 page to point at: ask again, unconditionally.
      conditional.ifNoneMatch = undefined;
      live = await withEsiLane(lane, fetchLive);
      revalidated = undefined;
    }
    if (revalidated && 'cached' in revalidated) {
      return { cached: revalidated.cached, needsReauth: false };
    }
    const items = revalidated?.items ?? live.items;
    const { truncated } = live;
    const pages =
      conditional && !truncated
        ? pagesOf(conditional.pageResponses, revalidated?.counts)
        : undefined;
    const fetchedAt = Date.now();
    // Whether the stored list is complete is a meta question; its value is
    // read only when it is about to be served in place of this partial one.
    const existingMeta = truncated ? (await readMetaOrRow(characterId, key))?.meta : undefined;
    const existing =
      existingMeta !== undefined && existingMeta.truncated !== true ? await read() : undefined;
    if (existing === undefined) {
      const expiresAt = parseExpiresHeader(options.expiresCapture?.value);
      await db.esiCache.put({
        characterId,
        key,
        value: items,
        fetchedAt,
        truncated,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(pages ? { pages, etag: pagedEtag(pages) } : {}),
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
    unsent = timedOutAtGate(err);
    // Offline/5xx: fall back to cache, as loadWithCacheStatus does. An auth
    // failure additionally sets needsReauth so a revoked scope offers a
    // re-login instead of a silent empty list (issue #14).
    if (detectAuthFailure(err)) {
      needsReauth = true;
      // Gated by isWorthReportingToShell (issue #1521) — see loadWithCacheStatusLive.
      if (await isWorthReportingToShell(characterId, err)) emitEsiAuthFailure(characterId);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await read();
  const fallback: StatusResult<T[]> = cached
    ? {
        cached: {
          data: cached.value as T[],
          fetchedAt: new Date(cached.fetchedAt),
          fromCache: true,
          truncated: cached.truncated,
        },
        needsReauth,
      }
    : { cached: null, needsReauth };
  if (unsent) unsentResults.add(fallback);
  return fallback;
}

/** Paginated read-through, dropping the auth-failure distinction. */
export async function loadPaginatedWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadPaginatedWithCacheOptions<T> = {}
): Promise<CachedResult<T[]> | null> {
  return (await loadPaginatedWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

/**
 * The single `etag` a paginated row is stored under: every page's, together,
 * so the whole-list 304 bump (`applyNotModified`) and `metaVouchesFor` judge
 * it exactly as they judge a single response's.
 */
function pagedEtag(pages: ReadonlyArray<CachedPage>): string {
  return JSON.stringify(pages.map((page) => page.etag));
}

/** The stored pages worth revalidating, if any. Reads meta only. */
async function revalidationPages(
  characterId: number,
  key: string
): Promise<CachedPage[] | undefined> {
  const meta = await readMeta(characterId, key);
  // A partial list's ETags would vouch only for the part we hold.
  if (!meta?.pages?.length || meta.truncated === true) return undefined;
  return meta.etag === pagedEtag(meta.pages) ? meta.pages : undefined;
}

/** Each collected page's ETag and item count; undefined unless every page has an ETag. */
function pagesOf<T>(
  responses: ReadonlyArray<PageResponse<T>> | undefined,
  counts: ReadonlyArray<number> | undefined
): CachedPage[] | undefined {
  if (!responses?.length) return undefined;
  const pages: CachedPage[] = [];
  for (const [i, response] of responses.entries()) {
    if (response.etag === null) return undefined;
    pages.push({ etag: response.etag, count: counts?.[i] ?? response.items?.length ?? 0 });
  }
  return pages;
}

/**
 * Fold a per-page revalidation into one list:
 *
 * - `undefined`: no page was a 304 — the live items stand as they are.
 * - `{ cached }`: every page was a 304 and the page count held; meta was
 *   bumped and the stored value is handed back unwritten.
 * - `{ items, counts }`: the list rebuilt in page order — stored items for the
 *   304 pages, fresh ones for the rest — with each page's item count.
 * - `null`: the stored row is no longer the one the ETags vouched for, so a
 *   304 points at nothing we hold and the caller must refetch unconditionally.
 */
async function revalidatePages<T>(
  characterId: number,
  key: string,
  stored: ReadonlyArray<CachedPage>,
  conditional: PagedConditionalCapture<T>,
  live: TruncatableResult<T>,
  options: LoadWithCacheStatusOptions
): Promise<{ cached: CachedResult<T[]> } | { items: T[]; counts: number[] } | null | undefined> {
  const responses = conditional.pageResponses ?? [];
  if (!responses.some((response) => response.notModified)) return undefined;
  const sent = pagedEtag(stored);
  if (
    !live.truncated &&
    responses.length === stored.length &&
    responses.every((response) => response.notModified)
  ) {
    const cached = await applyNotModified<T[]>(
      characterId,
      key,
      sent,
      options.expiresCapture?.value ?? null
    );
    return cached ? { cached } : null;
  }
  if (await isCachePurgePending(characterId)) return null;
  const row = await db.esiCache.get([characterId, key]);
  if (row?.etag !== sent || !Array.isArray(row.value)) return null;
  const value = row.value as T[];
  const starts: number[] = [];
  let offset = 0;
  for (const page of stored) {
    starts.push(offset);
    offset += page.count;
  }
  if (offset !== value.length) return null;
  const items: T[] = [];
  const counts: number[] = [];
  for (const [i, response] of responses.entries()) {
    let page: T[];
    if (!response.notModified) page = response.items ?? [];
    else if (i < stored.length) page = value.slice(starts[i], starts[i] + stored[i].count);
    else return null;
    items.push(...page);
    counts.push(page.length);
  }
  return { items, counts };
}

// ---------------------------------------------------------------------------
// Row and meta reads
//
// Every read below is gated by `isCachePurgePending`: a character whose purge
// is still pending has rows we could not delete and are not allowed to serve,
// so its cache reads as empty (`cachePurge.ts`). One in-memory lookup per
// read, not per row. Writes are deliberately left alone — new rows are the
// *current* owner's data, and the pending purge sweeps them when it succeeds.
// ---------------------------------------------------------------------------

/** A stored row as a load serves it: the value, and the freshness to report. */
interface StoredRow {
  value: unknown;
  fetchedAt: number;
  truncated: boolean;
}

/** One load's memoized read of its stored row — see `rowReader`. */
type RowReader = () => Promise<StoredRow | undefined>;

/**
 * The stored row for one load, deserialized at most once however many of its
 * paths want it — a stale serve at the grace mark and the fallback after the
 * live call it raced both used to read (and deserialize) it separately.
 *
 * The purge gate is re-checked on every call, not memoized with the row: a
 * purge that becomes pending mid-load must still suppress it.
 */
function rowReader(characterId: number, key: string): RowReader {
  let memo: Promise<StoredRow | undefined> | undefined;
  return async () => {
    if (await isCachePurgePending(characterId)) return undefined;
    memo ??= readStoredRow(characterId, key);
    const row = await memo;
    return (await isCachePurgePending(characterId)) ? undefined : row;
  };
}

async function readStoredRow(characterId: number, key: string): Promise<StoredRow | undefined> {
  const [row, meta] = await Promise.all([
    db.esiCache.get([characterId, key]),
    db.esiCacheMeta.get([characterId, key]),
  ]);
  if (!row) return undefined;
  return {
    value: row.value,
    fetchedAt: effectiveFetchedAt(meta, row),
    truncated: row.truncated === true,
  };
}

/** A row's meta, without its value. Absent for rows older than `esiCacheMeta`. */
async function readMeta(characterId: number, key: string): Promise<EsiCacheMetaRecord | undefined> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCacheMeta.get([characterId, key]);
}

/**
 * A row's meta; for a row older than `esiCacheMeta`, the whole row read the
 * old way (returned too, so a hit does not read it twice) with its meta
 * written behind it — a one-time cost per legacy row, where an `upgrade()`
 * backfill would have paid it for every row at open.
 */
async function readMetaOrRow(
  characterId: number,
  key: string
): Promise<{ meta: EsiCacheMetaRecord; row?: EsiCacheRecord } | undefined> {
  const meta = await readMeta(characterId, key);
  if (meta) return { meta };
  if (await isCachePurgePending(characterId)) return undefined;
  const row = await db.esiCache.get([characterId, key]);
  if (!row) return undefined;
  void backfillMeta(row);
  return { meta: metaOf(row), row };
}

/** Never rejects: a failed backfill only means the next read takes the legacy path again. */
async function backfillMeta(row: EsiCacheRecord): Promise<void> {
  await writeMetaFor(row, (current) => current === undefined);
}

/**
 * Replace meta that no longer describes its row (see `metaVouchesFor`) —
 * only if it is still the meta that was judged, so a row rewritten since
 * (whose write brought its own meta) keeps it. Never rejects.
 */
async function realignMeta(row: EsiCacheRecord, judged: EsiCacheMetaRecord): Promise<void> {
  await writeMetaFor(
    row,
    (current) =>
      current !== undefined &&
      current.fetchedAt === judged.fetchedAt &&
      current.etag === judged.etag
  );
}

async function writeMetaFor(
  row: EsiCacheRecord,
  shouldWrite: (current: EsiCacheMetaRecord | undefined) => boolean
): Promise<void> {
  const id: [number, string] = [row.characterId, row.key];
  try {
    await db.transaction('rw', db.esiCache, db.esiCacheMeta, async () => {
      // Re-decided inside the transaction: a row rewritten since (which wrote
      // its own meta) or deleted since must not be given this projection.
      if (!shouldWrite(await db.esiCacheMeta.get(id))) return;
      if (!(await hasValueRow(id))) return;
      await db.esiCacheMeta.put(metaOf(row));
    });
  } catch {
    // Best effort.
  }
}

/**
 * Meta whose value is gone — only reachable if something bypassed the db
 * middleware (a bundle from before it). Dropped so it cannot keep claiming a
 * fresh row; never rejects.
 */
async function dropOrphanMeta(characterId: number, key: string): Promise<void> {
  const id: [number, string] = [characterId, key];
  try {
    await db.transaction('rw', db.esiCache, db.esiCacheMeta, async () => {
      if (!(await hasValueRow(id))) {
        await db.esiCacheMeta.delete(id);
      }
    });
  } catch {
    // Best effort.
  }
}

/** The raw stored row for the non-loader readers below; purge-gated like every read. */
async function readCachedRow(
  characterId: number,
  key: string
): Promise<EsiCacheRecord | undefined> {
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

  const ids = characterIds.map((id): [number, string] => [id, key]);
  const [rows, metas] = await Promise.all([db.esiCache.bulkGet(ids), db.esiCacheMeta.bulkGet(ids)]);
  const suppressed = await Promise.all(characterIds.map((id) => isCachePurgePending(id)));

  rows.forEach((row, i) => {
    if (!row || suppressed[i]) return;
    found.set(characterIds[i], {
      data: row.value as T,
      fetchedAt: new Date(effectiveFetchedAt(metas[i], row)),
      fromCache: true,
      truncated: row.truncated === true,
    });
  });
  return found;
}

/**
 * Many keys for one character, with each row's `fetchedAt`. One purge check
 * and one `bulkGet` rather than a read per key: `resolveNames` asks for a name
 * per distinct entity on a page, which is hundreds on an asset list.
 */
export async function readCachedEntries<T>(
  characterId: number,
  keys: readonly string[]
): Promise<Map<string, { value: T; fetchedAt: number }>> {
  const found = new Map<string, { value: T; fetchedAt: number }>();
  if (keys.length === 0) return found;
  if (await isCachePurgePending(characterId)) return found;

  const ids = keys.map((key): [number, string] => [characterId, key]);
  const [rows, metas] = await Promise.all([db.esiCache.bulkGet(ids), db.esiCacheMeta.bulkGet(ids)]);
  rows.forEach((row, i) => {
    if (!row) return;
    found.set(keys[i], { value: row.value as T, fetchedAt: effectiveFetchedAt(metas[i], row) });
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

/**
 * `writeCached` for a batch: one `bulkPut` (one IndexedDB transaction) rather
 * than a transaction per row awaited in turn. Same row shape as `writeCached`,
 * so the two are interchangeable to every reader.
 */
export async function writeCachedMany(
  characterId: number,
  rows: ReadonlyArray<readonly [key: string, value: unknown]>,
  fetchedAt: number
): Promise<void> {
  if (rows.length === 0) return;
  await db.esiCache.bulkPut(rows.map(([key, value]) => ({ characterId, key, value, fetchedAt })));
}
