import { db, type CachedPage, type EsiCacheMetaRecord, type EsiCacheRecord } from '@/db';
import { metaOf } from '@/db/esiCacheMeta';
import { emitEsiAuthFailure, emitEsiRoleRefusal } from './authFailureSignal';
import { EsiError, EsiTimeoutError, isAuthFailure, isMissingRole, type EsiResult } from './client';
import { isCachePurgePending } from './cachePurge';
import { effectiveFetchedAt, metaVouchesFor } from './cacheRows';
import { promoteEsiLane } from './budget';
import { laneForLoad, viewPriority, withEsiLane, type EsiLane } from './lane';
import { grantHoldsEndpointScope } from './grantScope';
import { beginCacheMiss, type CacheMissReason } from './cacheMissSignal';
import type { PageResponse, PaginatedResult, TruncatableResult } from './paginated';
import type { EsiEndpointId } from './registry';
import { MINUTE_MS, DAY_MS } from '@/lib/age';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  expiresAt?: Date;
  fromCache: boolean;
  truncated: boolean;
}

export interface StatusResult<T> {
  cached: CachedResult<T> | null;
  needsReauth: boolean;
  fetchFailed?: boolean;
}

export const GLOBAL_CACHE_CHARACTER_ID = 0;

export const STRUCTURE_CACHE_KEY_PREFIX = 'structure:';

export const CORP_CACHE_KEY_PREFIX = 'corp:';

export function corpCacheKey(corporationId: number, key: string): string {
  return `${CORP_CACHE_KEY_PREFIX}${corporationId}:${key}`;
}

export function cacheKeyFamily(key: string): string {
  let rest = key;
  let scope = '';
  if (rest.startsWith(CORP_CACHE_KEY_PREFIX)) {
    scope = CORP_CACHE_KEY_PREFIX;
    rest = rest.slice(CORP_CACHE_KEY_PREFIX.length).replace(/^\d+:/, '');
  }
  const head = rest.split(':', 1)[0] ?? rest;
  return scope + head.replace(/\d+/g, '*');
}

export interface ExpiresCapture {
  value: string | null;
}

export interface ConditionalCapture {
  ifNoneMatch: string | undefined;
  etag: string | null;
  expires: string | null;
  notModified: boolean;
}

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

export interface PagedConditionalCapture<T> {
  ifNoneMatch: ReadonlyArray<string> | undefined;
  pageResponses: PageResponse<T>[] | undefined;
}

export function conditionalPagedFetch<T>(
  fetch: (options: {
    pageEtags: ReadonlyArray<string | undefined>;
  }) => Promise<TruncatableResult<T> & Pick<PaginatedResult<T>, 'pageResponses' | 'expires'>>
): {
  fetchLive: () => Promise<TruncatableResult<T>>;
  conditional: PagedConditionalCapture<T>;
  expiresCapture: ExpiresCapture;
} {
  const conditional: PagedConditionalCapture<T> = {
    ifNoneMatch: undefined,
    pageResponses: undefined,
  };
  const expiresCapture: ExpiresCapture = { value: null };
  const fetchLive = async (): Promise<TruncatableResult<T>> => {
    const result = await fetch({ pageEtags: conditional.ifNoneMatch ?? [] });
    conditional.pageResponses = result.pageResponses;
    expiresCapture.value = result.expires ?? null;
    return result;
  };
  return { fetchLive, conditional, expiresCapture };
}

export const STALE_AFTER = {
  default: 10 * MINUTE_MS,
  static: DAY_MS,
} as const;

export const REFRESH_BYPASS_MS = 30_000;

export interface LoadWithCacheStatusOptions {
  authFailureEndpoint?: EsiEndpointId;
  detectAuthFailure?: (err: unknown) => boolean;
  skipCacheOnAuthFailure?: boolean;
  expiresCapture?: ExpiresCapture;
  staleAfterMs?: number;
  allowStaleServe?: boolean;
}

export interface LoadSingleWithCacheOptions extends LoadWithCacheStatusOptions {
  conditional?: ConditionalCapture;
  reportFetchFailure?: boolean;
}

export interface LoadPaginatedWithCacheOptions<T> extends LoadWithCacheStatusOptions {
  conditional?: PagedConditionalCapture<T>;
}

let freshnessInvalidatedAt = 0;

export function invalidateFreshness(): void {
  freshnessInvalidatedAt = Date.now();
}

function isRefreshInvalidated(fetchedAt: number, staleAfterMs: number, now: number): boolean {
  if (staleAfterMs > STALE_AFTER.default) return false;
  return fetchedAt <= freshnessInvalidatedAt && now - freshnessInvalidatedAt <= REFRESH_BYPASS_MS;
}

function expiryField(ms: number | undefined): { expiresAt?: Date } {
  return ms === undefined ? {} : { expiresAt: new Date(ms) };
}

function parseExpiresHeader(expires: string | null | undefined): number | undefined {
  if (!expires) return undefined;
  const ms = Date.parse(expires);
  return Number.isNaN(ms) ? undefined : ms;
}

const inFlightLoads = new Map<string, { promise: Promise<unknown>; lane: EsiLane | undefined }>();

function dedupeKey(characterId: number, key: string): string {
  return `${characterId}:${key}`;
}

async function withDedupe<R>(
  characterId: number,
  key: string,
  lane: EsiLane | undefined,
  reason: CacheMissReason,
  run: () => Promise<R>
): Promise<R> {
  const dkey = dedupeKey(characterId, key);
  const existing = inFlightLoads.get(dkey);
  if (existing) {
    if (lane === undefined && existing.lane !== undefined) {
      promoteEsiLane(existing.lane, viewPriority(characterId));
    }
    return existing.promise as Promise<R>;
  }

  const endMiss = beginCacheMiss({
    family: cacheKeyFamily(key),
    reason,
    global: characterId === GLOBAL_CACHE_CHARACTER_ID,
  });
  let entry: { promise: Promise<unknown>; lane: EsiLane | undefined } | undefined;
  try {
    const promise = run();
    entry = { promise, lane };
    inFlightLoads.set(dkey, entry);
    return await promise;
  } finally {
    if (entry && inFlightLoads.get(dkey) === entry) inFlightLoads.delete(dkey);
    endMiss();
  }
}

const pendingLoads = new Set<{ key: string; promise: Promise<unknown> }>();

function trackLoad<R>(characterId: number, key: string, run: () => Promise<R>): Promise<R> {
  const promise = run();
  const entry = { key: dedupeKey(characterId, key), promise };
  pendingLoads.add(entry);
  return promise.finally(() => pendingLoads.delete(entry));
}

export async function settleEsiCacheLoads(timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pending = [
      ...pendingLoads,
      ...[...inFlightLoads].map(([key, entry]) => ({ key, promise: entry.promise })),
    ];
    if (pending.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), Math.max(deadline - Date.now(), 0));
    });
    const settled = Promise.allSettled(pending.map((entry) => entry.promise)).then(
      () => 'settled' as const
    );
    const outcome = await Promise.race([settled, timedOut]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      const keys = [...new Set(pending.map((entry) => entry.key))].join(', ');
      inFlightLoads.clear();
      pendingLoads.clear();
      throw new Error(`ESI cache load still pending after ${timeoutMs}ms: ${keys}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

type RevalidatedListener = () => void;
const revalidatedListeners = new Set<RevalidatedListener>();

export function onCacheRevalidated(listener: RevalidatedListener): () => void {
  revalidatedListeners.add(listener);
  return () => revalidatedListeners.delete(listener);
}

export function emitCacheRevalidated(): void {
  for (const listener of revalidatedListeners) listener();
}

interface RevalidationFailure {
  at: number;
  needsReauth: boolean;
}
const revalidationFailures = new Map<string, RevalidationFailure>();

const unsentResults = new WeakSet<object>();

function timedOutAtGate(err: unknown): boolean {
  return err instanceof EsiTimeoutError && !err.sent;
}

function recentRevalidationFailure(dkey: string, now: number): RevalidationFailure | undefined {
  const failure = revalidationFailures.get(dkey);
  if (failure === undefined) return undefined;
  return now - failure.at < STALE_AFTER.default ? failure : undefined;
}

export const STALE_GRACE_MS = 250;

const GRACE = Symbol('grace');

async function loadPastWindow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  read: RowReader,
  lane: EsiLane | undefined,
  reason: CacheMissReason,
  runLive: () => Promise<StatusResult<T>>
): Promise<StatusResult<T>> {
  const dkey = dedupeKey(characterId, key);
  if (staleAfterMs > STALE_AFTER.default && options.allowStaleServe !== true) {
    if (staleAfterMs >= STALE_AFTER.static && options.skipCacheOnAuthFailure !== true) {
      return loadLapsedConstant(
        characterId,
        key,
        staleAfterMs,
        options,
        dkey,
        read,
        lane,
        reason,
        runLive
      );
    }
    return withDedupe(characterId, key, lane, reason, runLive);
  }

  const held = await heldAfterFailure<T>(staleAfterMs, options, dkey, read);
  if (held) return held;

  const live = withDedupe(characterId, key, lane, reason, runLive);
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<typeof GRACE>((resolve) => {
    graceTimer = setTimeout(() => resolve(GRACE), STALE_GRACE_MS);
  });
  const settled = live.then(
    (result) => ({ ok: true as const, result }),
    (error) => ({ ok: false as const, error })
  );

  const winner = await Promise.race([settled, grace]);
  if (winner !== GRACE) {
    clearTimeout(graceTimer);
    if (!winner.ok) throw winner.error;
    if (succeededLive(winner.result)) revalidationFailures.delete(dkey);
    return winner.result;
  }

  const stale = await readStaleRow<T>(read, staleAfterMs);
  if (!stale) {
    const outcome = await settled;
    if (!outcome.ok) throw outcome.error;
    return outcome.result;
  }

  void recordLateOutcome(dkey, settled);
  return { cached: stale, needsReauth: false };
}

async function loadLapsedConstant<T>(
  characterId: number,
  key: string,
  staleAfterMs: number,
  options: LoadWithCacheStatusOptions,
  dkey: string,
  read: RowReader,
  lane: EsiLane | undefined,
  reason: CacheMissReason,
  runLive: () => Promise<StatusResult<T>>
): Promise<StatusResult<T>> {
  const held = await heldAfterFailure<T>(staleAfterMs, options, dkey, read);
  if (held) return held;

  const stale = await readStaleRow<T>(read, staleAfterMs);
  const live = withDedupe(characterId, key, lane, reason, runLive);
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

function succeededLive(result: { cached: { fromCache: boolean } | null }): boolean {
  return result.cached !== null && !result.cached.fromCache;
}

async function recordLateOutcome<T>(
  dkey: string,
  settled: Promise<{ ok: true; result: StatusResult<T> } | { ok: false; error: unknown }>
): Promise<void> {
  const outcome = await settled;
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
    ...expiryField(row.expiresAt),
    truncated: row.truncated === true,
    fromCache: false,
  };
}

export function resetRevalidationState(): void {
  revalidationFailures.clear();
}

export function clearRevalidationFailures(): void {
  for (const [dkey, failure] of revalidationFailures) {
    if (!failure.needsReauth) revalidationFailures.delete(dkey);
  }
}

export async function loadWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadSingleWithCacheOptions = {}
): Promise<StatusResult<T>> {
  return trackLoad(characterId, key, async () => {
    const lane = laneForLoad();
    const staleAfterMs = options.staleAfterMs ?? STALE_AFTER.default;
    const fresh = await readFreshRow<T>(characterId, key, staleAfterMs);
    if (!isMiss(fresh)) return { cached: fresh, needsReauth: false };

    const read = rowReader(characterId, key);
    return loadPastWindow<T>(characterId, key, staleAfterMs, options, read, lane, fresh, () =>
      loadWithCacheStatusLive(characterId, key, fetchLive, options, read, lane)
    );
  });
}

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
    let data = await withEsiLane(lane, fetchLive);
    if (conditional?.notModified) {
      const revalidated = await applyNotModified<T>(
        characterId,
        key,
        conditional.ifNoneMatch,
        conditional.expires
      );
      if (revalidated) return { cached: revalidated, needsReauth: false };
      conditional.ifNoneMatch = undefined;
      data = await withEsiLane(lane, fetchLive);
    }
    if (data !== null && conditional?.notModified !== true) {
      const fetchedAt = Date.now();
      const expiresAt = parseExpiresHeader(conditional?.expires ?? options.expiresCapture?.value);
      const etag = conditional?.etag ?? undefined;
      await db.esiCache.put({
        characterId,
        key,
        value: data,
        fetchedAt,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(etag !== undefined ? { etag } : {}),
      });
      return {
        cached: {
          data,
          fetchedAt: new Date(fetchedAt),
          ...expiryField(expiresAt),
          fromCache: false,
          truncated: false,
        },
        needsReauth: false,
      };
    }
  } catch (err) {
    unsent = timedOutAtGate(err);
    if (isMissingRole(err)) emitEsiRoleRefusal(characterId, options.authFailureEndpoint);
    else if (detectAuthFailure(err)) {
      needsReauth = true;
      if (await isWorthReportingToShell(characterId, err))
        emitEsiAuthFailure(characterId, options.authFailureEndpoint);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await read();
  const fallback: StatusResult<T> = cached
    ? {
        cached: {
          data: cached.value as T,
          fetchedAt: new Date(cached.fetchedAt),
          ...expiryField(cached.expiresAt),
          fromCache: true,
          truncated: cached.truncated,
        },
        needsReauth,
      }
    : {
        cached: null,
        needsReauth,
        ...(options.reportFetchFailure && !needsReauth ? { fetchFailed: true } : {}),
      };
  if (unsent) unsentResults.add(fallback);
  return fallback;
}

async function revalidationEtag(characterId: number, key: string): Promise<string | undefined> {
  const meta = await readMeta(characterId, key);
  return meta && meta.truncated !== true ? meta.etag : undefined;
}

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
      ...expiryField(bumped.expiresAt),
      fromCache: false,
      truncated: row.truncated === true,
    };
  });
}

function isWithinWindow(meta: EsiCacheMetaRecord, staleAfterMs: number, now: number): boolean {
  if (isPastWindow(meta, staleAfterMs, now)) return false;
  return !isRefreshInvalidated(meta.fetchedAt, staleAfterMs, now);
}

function isPastWindow(meta: EsiCacheMetaRecord, staleAfterMs: number, now: number): boolean {
  return Math.max(meta.expiresAt ?? 0, meta.fetchedAt + staleAfterMs) <= now;
}

function pastWindowReason(
  meta: EsiCacheMetaRecord,
  staleAfterMs: number,
  now: number
): CacheMissReason {
  return isPastWindow(meta, staleAfterMs, now) ? 'expired' : 'refresh';
}

function isMiss<T>(fresh: CachedResult<T> | CacheMissReason): fresh is CacheMissReason {
  return typeof fresh === 'string';
}

async function readFreshRow<T>(
  characterId: number,
  key: string,
  staleAfterMs: number
): Promise<CachedResult<T> | CacheMissReason> {
  const found = await readMetaOrRow(characterId, key);
  if (!found) return 'cold';
  const { meta } = found;
  const now = Date.now();
  if (!isWithinWindow(meta, staleAfterMs, now)) return pastWindowReason(meta, staleAfterMs, now);
  const row = found.row ?? (await db.esiCache.get([characterId, key]));
  if (!row) {
    void dropOrphanMeta(characterId, key);
    return 'cold';
  }
  const own = metaVouchesFor(meta, row) ? meta : metaOf(row);
  if (own !== meta) {
    void realignMeta(row, meta);
    if (!isWithinWindow(own, staleAfterMs, now)) return pastWindowReason(own, staleAfterMs, now);
  }
  return {
    data: row.value as T,
    fetchedAt: new Date(own.fetchedAt),
    ...expiryField(own.expiresAt),
    fromCache: false,
    truncated: own.truncated === true,
  };
}

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
    return false;
  }
}

export async function cachedKeySet(
  characterId: number,
  keys: readonly string[]
): Promise<Set<string> | null> {
  if (await isCachePurgePending(characterId)) return null;
  if (keys.length === 0) return new Set();
  const found = await db.esiCache
    .where(':id')
    .anyOf(keys.map((key): [number, string] => [characterId, key]))
    .primaryKeys();
  return new Set(found.map(([, key]) => key));
}

async function hasValueRow(id: [number, string]): Promise<boolean> {
  return (await db.esiCache.where(':id').equals(id).count()) > 0;
}

export async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>,
  options: LoadSingleWithCacheOptions = {}
): Promise<CachedResult<T> | null> {
  return (await loadWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

export function loadStaticEntity<T>(
  prefix: string,
  id: number,
  fetcher: (id: number, options: { etag?: string }) => Promise<EsiResult<T>>
): Promise<CachedResult<T> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) => fetcher(id, options));
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, `${prefix}:${id}`, fetchLive, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
}

export async function loadPaginatedWithCacheStatus<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadPaginatedWithCacheOptions<T> = {}
): Promise<StatusResult<T[]>> {
  return trackLoad(characterId, key, async () => {
    const lane = laneForLoad();
    const staleAfterMs = options.staleAfterMs ?? STALE_AFTER.default;
    const fresh = await readFreshRow<T[]>(characterId, key, staleAfterMs);
    if (!isMiss(fresh)) return { cached: fresh, needsReauth: false };

    const read = rowReader(characterId, key);
    return loadPastWindow<T[]>(characterId, key, staleAfterMs, options, read, lane, fresh, () =>
      loadPaginatedWithCacheStatusLive(characterId, key, fetchLive, options, read, lane)
    );
  });
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
    let live = await withEsiLane(lane, fetchLive);
    let revalidated =
      stored && conditional
        ? await revalidatePages<T>(characterId, key, stored, conditional, live, options)
        : undefined;
    if (revalidated === null && conditional) {
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
        cached: {
          data: items,
          fetchedAt: new Date(fetchedAt),
          ...expiryField(expiresAt),
          fromCache: false,
          truncated,
        },
        needsReauth: false,
      };
    }
    return {
      cached: {
        data: existing.value as T[],
        fetchedAt: new Date(existing.fetchedAt),
        ...expiryField(existing.expiresAt),
        fromCache: true,
        truncated: false,
      },
      needsReauth: false,
    };
  } catch (err) {
    unsent = timedOutAtGate(err);
    if (isMissingRole(err)) emitEsiRoleRefusal(characterId, options.authFailureEndpoint);
    else if (detectAuthFailure(err)) {
      needsReauth = true;
      if (await isWorthReportingToShell(characterId, err))
        emitEsiAuthFailure(characterId, options.authFailureEndpoint);
      if (options.skipCacheOnAuthFailure) return { cached: null, needsReauth: true };
    }
  }
  const cached = await read();
  const fallback: StatusResult<T[]> = cached
    ? {
        cached: {
          data: cached.value as T[],
          fetchedAt: new Date(cached.fetchedAt),
          ...expiryField(cached.expiresAt),
          fromCache: true,
          truncated: cached.truncated,
        },
        needsReauth,
      }
    : { cached: null, needsReauth };
  if (unsent) unsentResults.add(fallback);
  return fallback;
}

export async function loadPaginatedWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<TruncatableResult<T>>,
  options: LoadPaginatedWithCacheOptions<T> = {}
): Promise<CachedResult<T[]> | null> {
  return (await loadPaginatedWithCacheStatus(characterId, key, fetchLive, options)).cached;
}

function pagedEtag(pages: ReadonlyArray<CachedPage>): string {
  return JSON.stringify(pages.map((page) => page.etag));
}

async function revalidationPages(
  characterId: number,
  key: string
): Promise<CachedPage[] | undefined> {
  const meta = await readMeta(characterId, key);
  if (!meta?.pages?.length || meta.truncated === true) return undefined;
  return meta.etag === pagedEtag(meta.pages) ? meta.pages : undefined;
}

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

interface StoredRow {
  value: unknown;
  fetchedAt: number;
  expiresAt?: number;
  truncated: boolean;
}

type RowReader = () => Promise<StoredRow | undefined>;

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
  const expiresAt = meta?.expiresAt ?? row.expiresAt;
  return {
    value: row.value,
    fetchedAt: effectiveFetchedAt(meta, row),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    truncated: row.truncated === true,
  };
}

async function readMeta(characterId: number, key: string): Promise<EsiCacheMetaRecord | undefined> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCacheMeta.get([characterId, key]);
}

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

async function backfillMeta(row: EsiCacheRecord): Promise<void> {
  await writeMetaFor(row, (current) => current === undefined);
}

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
      if (!shouldWrite(await db.esiCacheMeta.get(id))) return;
      if (!(await hasValueRow(id))) return;
      await db.esiCacheMeta.put(metaOf(row));
    });
  } catch {}
}

async function dropOrphanMeta(characterId: number, key: string): Promise<void> {
  const id: [number, string] = [characterId, key];
  try {
    await db.transaction('rw', db.esiCache, db.esiCacheMeta, async () => {
      if (!(await hasValueRow(id))) {
        await db.esiCacheMeta.delete(id);
      }
    });
  } catch {}
}

export {
  readCached,
  readCachedEntries,
  readCachedRows,
  writeCached,
  writeCachedMany,
} from './cacheRows';
