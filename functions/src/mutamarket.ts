/**
 * MutaMarket estimate proxy (the `mutamarketEstimate` callable): one abyssal
 * module's estimated value, by EVE type id + item id. Scope decision:
 * docs/context/decisions/20261016-085744-mutamarket-is-the-abyssal-price-source.md.
 *
 * Why server side: MutaMarket's API sends no CORS headers, and it asks every
 * caller for a User-Agent with a contact address — which page JS can't set.
 *
 * MutaMarket asks that `POST /api/modules` (import from ESI + run the price
 * model, seconds per call) is never looped, and an import publishes the
 * module's rolls and creator on mutamarket.com, so:
 * - GET `/api/modules/{itemId}` first. A 404 is `not-imported`; POST only when
 *   the caller sent `importIfMissing` (a pilot's explicit click). A POST for
 *   a known module re-imports it, which is the loop they forbid.
 * - No POST for a type `/api/estimator-statistics` doesn't list (not an
 *   abyssal type MutaMarket prices) or whose model is untrained (`r2` null:
 *   the import would carry no estimate anyway).
 * - Imports run one at a time, `IMPORT_MIN_GAP_MS` apart, at most
 *   `MAX_PENDING_IMPORTS` waiting; past that the caller is told to come back.
 * - A failed import (5xx, timeout) backs off per module for
 *   `IMPORT_FAILURE_BACKOFF_MS`, so retrying clients can't loop it either.
 * - Every answer MutaMarket gives is held in memory for a TTL, keyed by type
 *   and item id so a wrong type id can't blank another caller's answer.
 *   Network and 5xx failures are not.
 *
 * The callable runs with `maxInstances: 1`, so the memory cache and the
 * import queue are global rather than per instance.
 */

import { ESI_USER_AGENT } from './esiNotifications.js';
import { isPlainRecord } from './guards.js';

const MUTAMARKET_API = 'https://mutamarket.com/api';
const MUTAMARKET_SITE = 'https://mutamarket.com';

export const MUTAMARKET_USER_AGENT = `${ESI_USER_AGENT}; contact: https://github.com/shawndibble/neocom-desk/issues`;

/** A module's estimate: MutaMarket retrains per type every few days. */
export const ESTIMATE_TTL_MS = 6 * 60 * 60 * 1000;
/** "No estimate" / "unknown": re-asking sooner won't change the answer. */
export const NO_ESTIMATE_TTL_MS = 24 * 60 * 60 * 1000;
/** The per-type model list changes when MutaMarket retrains. */
const ESTIMATOR_STATS_TTL_MS = 24 * 60 * 60 * 1000;
/** `not-imported`: someone else may import it meanwhile. */
export const NOT_IMPORTED_TTL_MS = 60 * 60 * 1000;
export const IMPORT_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
export const IMPORT_MIN_GAP_MS = 3_000;
export const MAX_PENDING_IMPORTS = 5;
const REQUEST_TIMEOUT_MS = 20_000;
/** Size cap for each memory map (estimates, import backoff). */
const MAX_CACHE_ENTRIES = 5_000;

export interface EstimateInput {
  typeId: number;
  itemId: number;
  /** POST an import on a 404. Only on a pilot's explicit ask: it publishes the module. */
  importIfMissing: boolean;
}

/**
 * What MutaMarket says about one module.
 * - `priced`: a positive, finite estimate.
 * - `no-estimate`: MutaMarket knows the module (or its type) but has no value.
 * - `not-imported`: MutaMarket hasn't seen the module; `importIfMissing` would import it.
 * - `unknown`: not a type MutaMarket prices, or the import was refused.
 */
export type MutamarketEstimate =
  | { status: 'priced'; value: number; valueUpdatedAt: string | null; url: string | null }
  | { status: 'no-estimate'; url: string | null }
  | { status: 'not-imported' }
  | { status: 'unknown' };

/** MutaMarket is unreachable or failing; nothing was cached. */
export class MutamarketUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutamarketUnavailableError';
  }
}

export class MutamarketBusyError extends Error {
  constructor() {
    super('MutaMarket import queue is full');
    this.name = 'MutamarketBusyError';
  }
}

/** Callable maps it to `invalid-argument`. */
export class MutamarketInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutamarketInputError';
  }
}

function positiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new MutamarketInputError(`${field} must be a positive integer`);
  }
  return value;
}

export function parseEstimateInput(d: unknown): EstimateInput {
  if (!isPlainRecord(d))
    throw new MutamarketInputError('expected { typeId, itemId, importIfMissing? }');
  if (d.importIfMissing !== undefined && typeof d.importIfMissing !== 'boolean') {
    throw new MutamarketInputError('importIfMissing must be a boolean');
  }
  return {
    typeId: positiveId(d.typeId, 'typeId'),
    itemId: positiveId(d.itemId, 'itemId'),
    importIfMissing: d.importIfMissing === true,
  };
}

/**
 * A `ModuleEnvelope` body to an estimate. A module of another type than asked
 * is `unknown` (the item id isn't what the caller thinks it is); any value
 * that isn't a positive finite number is no estimate — never a silent 0.
 */
export function parseModuleEnvelope(body: unknown, typeId: number): MutamarketEstimate {
  const data = isPlainRecord(body) ? body.data : undefined;
  if (!isPlainRecord(data)) return { status: 'unknown' };
  const type = data.type;
  if (!isPlainRecord(type) || type.id !== typeId) return { status: 'unknown' };
  const slug = typeof data.slug === 'string' && /^[a-z0-9-]+$/.test(data.slug) ? data.slug : null;
  const url = slug ? `${MUTAMARKET_SITE}/modules/${slug}` : null;
  const value = data.estimated_value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { status: 'no-estimate', url };
  }
  const updatedAt = data.estimated_value_updated_at;
  return {
    status: 'priced',
    value,
    valueUpdatedAt: typeof updatedAt === 'string' ? updatedAt : null,
    url,
  };
}

/** `/api/estimator-statistics` to type id → whether its model is trained. */
function parseEstimatorStatistics(body: unknown): Map<number, boolean> {
  const out = new Map<number, boolean>();
  if (!Array.isArray(body)) return out;
  for (const row of body) {
    if (!isPlainRecord(row) || typeof row.type_id !== 'number') continue;
    out.set(row.type_id, typeof row.r2 === 'number');
  }
  return out;
}

export interface MutamarketDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: MutamarketDeps = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

interface Cached<V> {
  value: V;
  expiresAt: number;
}

/** Insertion-ordered TTL map; past `MAX_CACHE_ENTRIES` the oldest entry goes. */
class BoundedTtlMap<V> {
  private readonly entries = new Map<string, Cached<V>>();

  get(key: string, now: number): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt > now) return hit.value;
    this.entries.delete(key);
    return undefined;
  }

  set(key: string, value: V, expiresAt: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });
    if (this.entries.size > MAX_CACHE_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}

function ttlFor(estimate: MutamarketEstimate): number {
  if (estimate.status === 'priced') return ESTIMATE_TTL_MS;
  if (estimate.status === 'not-imported') return NOT_IMPORTED_TTL_MS;
  return NO_ESTIMATE_TTL_MS;
}

export class MutamarketProxy {
  private readonly deps: MutamarketDeps;
  private readonly estimates = new BoundedTtlMap<MutamarketEstimate>();
  private readonly importBackoff = new BoundedTtlMap<true>();
  private readonly inFlight = new Map<string, Promise<MutamarketEstimate>>();
  private stats: Cached<Map<number, boolean>> | null = null;
  private statsInFlight: Promise<Map<number, boolean>> | null = null;
  private importTail: Promise<unknown> = Promise.resolve();
  private pendingImports = 0;
  private lastImportAt = Number.NEGATIVE_INFINITY;

  constructor(deps: Partial<MutamarketDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * One module's estimate. Concurrent asks share a lookup; an import ask skips
   * a cached `not-imported` and never joins a lookup-only ask.
   */
  estimate(input: EstimateInput): Promise<MutamarketEstimate> {
    const key = `${input.typeId}:${input.itemId}`;
    const cached = this.estimates.get(key, this.deps.now());
    if (cached && !(cached.status === 'not-imported' && input.importIfMissing)) {
      return Promise.resolve(cached);
    }
    const flightKey = `${key}:${input.importIfMissing}`;
    const running = this.inFlight.get(flightKey);
    if (running) return running;
    const run = this.lookup(key, input).finally(() => this.inFlight.delete(flightKey));
    this.inFlight.set(flightKey, run);
    return run;
  }

  private async lookup(
    key: string,
    { typeId, itemId, importIfMissing }: EstimateInput
  ): Promise<MutamarketEstimate> {
    const trainedByType = await this.estimatorStats();
    const trained = trainedByType.get(typeId);
    // Not cached per item: the stats map already holds this answer by type.
    if (trained === undefined) return { status: 'unknown' };

    const got = await this.request(`${MUTAMARKET_API}/modules/${itemId}`, { method: 'GET' });
    if (got.status === 200) return this.remember(key, parseModuleEnvelope(got.body, typeId));
    if (got.status !== 404) throw new MutamarketUnavailableError(`GET module: ${got.status}`);

    if (!trained) return this.remember(key, { status: 'no-estimate', url: null });
    if (!importIfMissing) return this.remember(key, { status: 'not-imported' });
    if (this.importBackoff.get(key, this.deps.now())) {
      throw new MutamarketUnavailableError('import backing off after a failure');
    }

    const posted = await this.enqueueImport(() =>
      this.request(`${MUTAMARKET_API}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: typeId, item_id: itemId }),
      })
    ).catch((err: unknown) => {
      if (err instanceof MutamarketUnavailableError) this.backOffImport(key);
      throw err;
    });
    if (posted.status === 200) {
      return this.remember(key, parseModuleEnvelope(posted.body, typeId));
    }
    // 400/404/422: MutaMarket can't import it (not abyssal, item gone).
    if (posted.status === 400 || posted.status === 404 || posted.status === 422) {
      return this.remember(key, { status: 'unknown' });
    }
    this.backOffImport(key);
    throw new MutamarketUnavailableError(`POST module: ${posted.status}`);
  }

  private backOffImport(key: string): void {
    this.importBackoff.set(key, true, this.deps.now() + IMPORT_FAILURE_BACKOFF_MS);
  }

  private remember(key: string, value: MutamarketEstimate): MutamarketEstimate {
    this.estimates.set(key, value, this.deps.now() + ttlFor(value));
    return value;
  }

  private async estimatorStats(): Promise<Map<number, boolean>> {
    if (this.stats && this.stats.expiresAt > this.deps.now()) return this.stats.value;
    if (!this.statsInFlight) {
      this.statsInFlight = (async () => {
        const res = await this.request(`${MUTAMARKET_API}/estimator-statistics`, {
          method: 'GET',
        });
        if (res.status !== 200) {
          throw new MutamarketUnavailableError(`estimator-statistics: ${res.status}`);
        }
        const parsed = parseEstimatorStatistics(res.body);
        if (parsed.size === 0) throw new MutamarketUnavailableError('estimator-statistics empty');
        this.stats = { value: parsed, expiresAt: this.deps.now() + ESTIMATOR_STATS_TTL_MS };
        return parsed;
      })().finally(() => {
        this.statsInFlight = null;
      });
    }
    return this.statsInFlight;
  }

  /** One import at a time, `IMPORT_MIN_GAP_MS` apart; a full queue refuses. */
  private async enqueueImport<T>(run: () => Promise<T>): Promise<T> {
    if (this.pendingImports >= MAX_PENDING_IMPORTS) throw new MutamarketBusyError();
    this.pendingImports += 1;
    const turn = this.importTail.then(async () => {
      const wait = this.lastImportAt + IMPORT_MIN_GAP_MS - this.deps.now();
      if (wait > 0) await this.deps.sleep(wait);
      try {
        return await run();
      } finally {
        this.lastImportAt = this.deps.now();
      }
    });
    this.importTail = turn.catch(() => undefined);
    try {
      return await turn;
    } finally {
      this.pendingImports -= 1;
    }
  }

  private async request(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string }
  ): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await this.deps.fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'User-Agent': MUTAMARKET_USER_AGENT,
          ...init.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new MutamarketUnavailableError(err instanceof Error ? err.message : 'fetch failed');
    }
    if (response.status !== 200) {
      // Frees the socket for keep-alive; the body of a non-200 is never read.
      await response.body?.cancel().catch(() => {});
      return { status: response.status, body: null };
    }
    try {
      return { status: 200, body: await response.json() };
    } catch {
      throw new MutamarketUnavailableError('unreadable JSON');
    }
  }
}
