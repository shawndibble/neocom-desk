/**
 * MutaMarket estimate proxy (the `mutamarketEstimate` callable): one abyssal
 * module's estimated value, by EVE type id + item id. Scope decision:
 * docs/context/decisions/20261016-085744-mutamarket-is-the-abyssal-price-source.md.
 *
 * Why server side: MutaMarket's API sends no CORS headers, and it asks every
 * caller for a User-Agent with a contact address — which page JS can't set.
 *
 * MutaMarket asks that `POST /api/modules` (import from ESI + run the price
 * model, seconds per call) is never looped, so:
 * - GET `/api/modules/{itemId}` first; POST only when MutaMarket answers 404.
 *   A POST for a known module re-imports it, which is the loop they forbid.
 * - No POST for a type `/api/estimator-statistics` doesn't list (not an
 *   abyssal type MutaMarket prices) or whose model is untrained (`r2` null:
 *   the import would carry no estimate anyway).
 * - Imports run one at a time, `IMPORT_MIN_GAP_MS` apart, at most
 *   `MAX_PENDING_IMPORTS` waiting; past that the caller is told to come back.
 * - Every answer MutaMarket gives — an estimate, no estimate, unknown — is
 *   held in memory for a TTL. Network and 5xx failures are not.
 *
 * The callable runs with `maxInstances: 1`, so the memory cache and the
 * import queue are global rather than per instance.
 */

export const MUTAMARKET_API = 'https://mutamarket.com/api';
export const MUTAMARKET_SITE = 'https://mutamarket.com';

/** MutaMarket's API overview asks for a User-Agent with a contact address. */
export const MUTAMARKET_USER_AGENT =
  'NeocomDesk/0.1.0 (+https://github.com/shawndibble/neocom-desk; contact: https://github.com/shawndibble/neocom-desk/issues)';

/** A module's estimate: MutaMarket retrains per type every few days. */
export const ESTIMATE_TTL_MS = 6 * 60 * 60 * 1000;
/** "No estimate" / "unknown": re-asking sooner won't change the answer. */
export const NO_ESTIMATE_TTL_MS = 24 * 60 * 60 * 1000;
/** The per-type model list changes when MutaMarket retrains. */
export const ESTIMATOR_STATS_TTL_MS = 24 * 60 * 60 * 1000;
export const IMPORT_MIN_GAP_MS = 3_000;
export const MAX_PENDING_IMPORTS = 5;
export const REQUEST_TIMEOUT_MS = 20_000;
/** Bound on the memory cache; the oldest entry goes first. */
export const MAX_CACHED_ESTIMATES = 5_000;

export interface EstimateInput {
  typeId: number;
  itemId: number;
}

/**
 * What MutaMarket says about one module.
 * - `priced`: a positive, finite estimate.
 * - `no-estimate`: MutaMarket knows the module (or its type) but has no value.
 * - `unknown`: not a type MutaMarket prices, or the import was refused.
 */
export type MutamarketEstimate =
  | { status: 'priced'; value: number; valueUpdatedAt: string | null; url: string | null }
  | { status: 'no-estimate'; url: string | null }
  | { status: 'unknown' };

/** MutaMarket is unreachable or failing; nothing was cached. */
export class MutamarketUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutamarketUnavailableError';
  }
}

/** The import queue is full; try again later. */
export class MutamarketBusyError extends Error {
  constructor() {
    super('MutaMarket import queue is full');
    this.name = 'MutamarketBusyError';
  }
}

/** Thrown for bad input; the callable maps it to `invalid-argument`. */
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

export function parseEstimateInput(data: unknown): EstimateInput {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MutamarketInputError('expected { typeId, itemId }');
  }
  const d = data as Record<string, unknown>;
  return { typeId: positiveId(d.typeId, 'typeId'), itemId: positiveId(d.itemId, 'itemId') };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A `ModuleEnvelope` body to an estimate. A module of another type than asked
 * is `unknown` (the item id isn't what the caller thinks it is); any value
 * that isn't a positive finite number is no estimate — never a silent 0.
 */
export function parseModuleEnvelope(body: unknown, typeId: number): MutamarketEstimate {
  const data = isRecord(body) ? body.data : undefined;
  if (!isRecord(data)) return { status: 'unknown' };
  const type = data.type;
  if (!isRecord(type) || type.id !== typeId) return { status: 'unknown' };
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
export function parseEstimatorStatistics(body: unknown): Map<number, boolean> {
  const out = new Map<number, boolean>();
  if (!Array.isArray(body)) return out;
  for (const row of body) {
    if (!isRecord(row) || typeof row.type_id !== 'number') continue;
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

export class MutamarketProxy {
  private readonly deps: MutamarketDeps;
  private readonly estimates = new Map<number, Cached<MutamarketEstimate>>();
  private readonly inFlight = new Map<number, Promise<MutamarketEstimate>>();
  private stats: Cached<Map<number, boolean>> | null = null;
  private statsInFlight: Promise<Map<number, boolean>> | null = null;
  private importTail: Promise<unknown> = Promise.resolve();
  private pendingImports = 0;
  private lastImportAt = Number.NEGATIVE_INFINITY;

  constructor(deps: Partial<MutamarketDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** One module's estimate. Concurrent asks for one item share a lookup. */
  estimate(input: EstimateInput): Promise<MutamarketEstimate> {
    const cached = this.estimates.get(input.itemId);
    if (cached && cached.expiresAt > this.deps.now()) return Promise.resolve(cached.value);
    const running = this.inFlight.get(input.itemId);
    if (running) return running;
    const run = this.lookup(input).finally(() => this.inFlight.delete(input.itemId));
    this.inFlight.set(input.itemId, run);
    return run;
  }

  private async lookup({ typeId, itemId }: EstimateInput): Promise<MutamarketEstimate> {
    const trainedByType = await this.estimatorStats();
    const trained = trainedByType.get(typeId);
    if (trained === undefined) return this.remember(itemId, { status: 'unknown' });

    const got = await this.request(`${MUTAMARKET_API}/modules/${itemId}`, { method: 'GET' });
    if (got.status === 200) return this.remember(itemId, parseModuleEnvelope(got.body, typeId));
    if (got.status !== 404) throw new MutamarketUnavailableError(`GET module: ${got.status}`);

    if (!trained) return this.remember(itemId, { status: 'no-estimate', url: null });

    const posted = await this.enqueueImport(() =>
      this.request(`${MUTAMARKET_API}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: typeId, item_id: itemId }),
      })
    );
    if (posted.status === 200) {
      return this.remember(itemId, parseModuleEnvelope(posted.body, typeId));
    }
    // 400: MutaMarket couldn't import it (not abyssal, not in EVE any more).
    if (posted.status === 400 || posted.status === 404 || posted.status === 422) {
      return this.remember(itemId, { status: 'unknown' });
    }
    throw new MutamarketUnavailableError(`POST module: ${posted.status}`);
  }

  private remember(itemId: number, value: MutamarketEstimate): MutamarketEstimate {
    const ttl = value.status === 'priced' ? ESTIMATE_TTL_MS : NO_ESTIMATE_TTL_MS;
    this.estimates.delete(itemId);
    this.estimates.set(itemId, { value, expiresAt: this.deps.now() + ttl });
    if (this.estimates.size > MAX_CACHED_ESTIMATES) {
      const oldest = this.estimates.keys().next().value;
      if (oldest !== undefined) this.estimates.delete(oldest);
    }
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
    let body: unknown = null;
    if (response.status === 200) {
      try {
        body = await response.json();
      } catch {
        throw new MutamarketUnavailableError('unreadable JSON');
      }
    }
    return { status: response.status, body };
  }
}
