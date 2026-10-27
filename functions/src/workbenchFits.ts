/**
 * EVE Workbench fits by hull (issue #2484): the sync behind the Popular fit
 * panel's EVE Workbench tab.
 *
 * EVE Workbench's public list (`GET /v1/fits/public?page=N`) is newest first,
 * 100 a page, and has no hull filter — so the app can't ask it for "this
 * hull's fits". This keeps our own copy instead: every public fit's summary
 * and EFT, grouped by hull into one R2 object per hull
 * (`workbench-fits/<shipTypeId>.json`) the client fetches by hull id. See the
 * decision doc this shipped with and, for the storage,
 * docs/context/decisions/20261018-232147-eve-workbench-fits-live-in-r2.md.
 *
 * Everything here is fetch- and storage-free: `runWorkbenchSync` takes the
 * HTTP call, the clock and the store as arguments, so paging, stop-at-known,
 * checkpointing, retry and changed-only writes are all unit-tested.
 * `workbenchFitsStore.ts` is the storage side (hulls and the checkpoint, all in
 * R2); `publicDataWorkbenchFits.ts` runs it from the GitHub Actions workflow.
 *
 * **Passes.** A pass walks the list from page 1 until it reaches a fit an
 * earlier pass already stored (or the end of the list). The first pass walks
 * all ~385 pages and fetches ~38k EFTs — far more than one run —
 * so a pass is checkpointed after every run: `pass.nextPage` is where the next
 * run resumes. New fits arriving mid-pass push older ones *down* the list, so a
 * resumed page re-sees a few fits rather than skipping any; re-storing one is
 * harmless (`mergeHullFits` is idempotent by id). Those new fits sit above the
 * pass's `head` and are picked up by the next pass, which stops at the head.
 *
 * **Stop-at-known.** Workbench ids are GUIDs, not ordered, so "already stored"
 * is the head's ids *or* anything not newer than the head's newest date. The
 * date half is what still stops the walk if every fit the head names was
 * deleted since.
 */

/** One public R2 object per hull under this prefix: `workbench-fits/<shipTypeId>.json`. */
export const WORKBENCH_FITS_R2_PREFIX = 'workbench-fits/';
/** Sync bookkeeping: an R2 object outside the `workbench-fits/` prefix the client reads. */
export const WORKBENCH_SYNC_STATE_R2_KEY = 'workbench-fits-state/state.json';
export const WORKBENCH_API_BASE = 'https://api.eveworkbench.com/v1';

/** Attempts per request before a run gives up on it (and stops, checkpointed). */
const MAX_ATTEMPTS = 3;
/** Longest Retry-After a run waits out; a longer ask ends the run (see `request`). */
const MAX_RETRY_WAIT_MS = 60_000;
/** Backoff for a 5xx with no Retry-After, times the attempt number. */
const SERVER_ERROR_BACKOFF_MS = 2_000;

/** One row of the public list, as stored on its way through a run. */
export interface WorkbenchFitSummary {
  id: string;
  name: string;
  shipTypeId: number;
  authorId: number | null;
  authorName: string;
  /** Epoch millis, UTC. */
  dateAdded: number;
}

/** One fit as stored in a hull object — everything the tab lists, plus the EFT that Loads it. */
export interface StoredWorkbenchFit {
  id: string;
  name: string;
  authorId: number | null;
  authorName: string;
  dateAdded: number;
  eft: string;
}

/** The newest fits a pass saw at its start: what the next pass stops at. */
export interface PassHead {
  ids: string[];
  dateAdded: number;
}

export interface WorkbenchSyncState {
  /** Head of the last *completed* pass; null until the first one completes. */
  boundary: PassHead | null;
  /** A pass still walking: the page it resumes at, and the head it'll promote on completion. */
  pass: { nextPage: number; head: PassHead } | null;
}

export interface PublicFitsPage {
  numberOfPages: number;
  /** Rows the page carried before any were dropped — 0 means the list has ended. */
  rowCount: number;
  fits: WorkbenchFitSummary[];
}

/** `workbenchFitsR2Key(626)` → `workbench-fits/626.json`. */
export function workbenchFitsR2Key(shipTypeId: number): string {
  return `${WORKBENCH_FITS_R2_PREFIX}${shipTypeId}.json`;
}

/** One hull's R2 object: every stored fit for it, newest first. */
export interface HullObject {
  shipTypeId: number;
  fits: StoredWorkbenchFit[];
}

export function publicFitsPageUrl(page: number): string {
  return `${WORKBENCH_API_BASE}/fits/public?page=${page}`;
}

export function fitEftUrl(id: string): string {
  return `${WORKBENCH_API_BASE}/fits/${encodeURIComponent(id)}/eft`;
}

const WORKBENCH_DATE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Workbench sends `2026-10-03T14:53:29.3375697`: no offset and seven
 * fraction digits. `Date.parse` reads an offset-less date-time as *local*
 * time and only promises three digits, so this reads it as UTC explicitly.
 */
export function parseWorkbenchDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = WORKBENCH_DATE.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction = '', offset] = match;
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  let at = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
  if (offset && offset !== 'Z') {
    const sign = offset.startsWith('-') ? -1 : 1;
    const [oh, om] = offset.slice(1).split(':').map(Number);
    at -= sign * (oh * 60 + om) * 60_000;
  }
  return Number.isFinite(at) ? at : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The fits of a stored hull object (or a legacy Firestore hull part), one
 * clean row each; a malformed row, or a body without a `fits` array, gives
 * none. The fields are rebuilt in `StoredWorkbenchFit`'s order.
 */
export function parseStoredFits(body: unknown): StoredWorkbenchFit[] {
  if (!isRecord(body) || !Array.isArray(body.fits)) return [];
  const fits: StoredWorkbenchFit[] = [];
  for (const row of body.fits as unknown[]) {
    if (!isRecord(row)) continue;
    const { id, name, authorId, authorName, dateAdded, eft } = row;
    if (typeof id !== 'string' || typeof eft !== 'string' || typeof dateAdded !== 'number') {
      continue;
    }
    fits.push({
      id,
      name: typeof name === 'string' ? name : '',
      authorId: typeof authorId === 'number' ? authorId : null,
      authorName: typeof authorName === 'string' ? authorName : '',
      dateAdded,
      eft,
    });
  }
  return fits;
}

function fitKey(fit: StoredWorkbenchFit): string {
  return JSON.stringify([fit.id, fit.name, fit.authorId, fit.authorName, fit.dateAdded, fit.eft]);
}

/** Whether two fit lists hold the same fits in the same order, whatever their objects' key order. */
export function sameFits(
  a: readonly StoredWorkbenchFit[],
  b: readonly StoredWorkbenchFit[]
): boolean {
  return a.length === b.length && a.every((fit, i) => fitKey(fit) === fitKey(b[i]));
}

function summaryFrom(row: unknown): WorkbenchFitSummary | null {
  if (!isRecord(row)) return null;
  const { Id, Name, ShipId, CharacterId, CharacterName, DateAdded } = row;
  if (typeof Id !== 'string' || Id.length === 0) return null;
  if (typeof ShipId !== 'number' || !Number.isInteger(ShipId) || ShipId <= 0) return null;
  const dateAdded = parseWorkbenchDate(DateAdded);
  if (dateAdded === null) return null;
  return {
    id: Id,
    name: typeof Name === 'string' ? Name.trim() : '',
    shipTypeId: ShipId,
    authorId: typeof CharacterId === 'number' && CharacterId > 0 ? CharacterId : null,
    authorName: typeof CharacterName === 'string' ? CharacterName.trim() : '',
    dateAdded,
  };
}

/** One page of the public list. Throws on Workbench's error envelope or an unrecognisable body. */
export function parsePublicFitsPage(body: unknown): PublicFitsPage {
  if (!isRecord(body)) throw new Error('EVE Workbench public fits: not an object');
  if (body.Error === true) {
    throw new Error(`EVE Workbench public fits: ${String(body.Message ?? 'error')}`);
  }
  if (!Array.isArray(body.Fits)) throw new Error('EVE Workbench public fits: no Fits array');
  const fits = body.Fits.map(summaryFrom).filter((fit) => fit !== null);
  const numberOfPages = typeof body.NumberOfPages === 'number' ? body.NumberOfPages : 0;
  return { numberOfPages, rowCount: body.Fits.length, fits };
}

/** A fit's EFT text from `/fits/{id}/eft`; null when Workbench has none to give. */
export function parseEftResponse(body: unknown): string | null {
  if (!isRecord(body) || body.Error === true) return null;
  return typeof body.Eft === 'string' && body.Eft.trim().length > 0 ? body.Eft : null;
}

/** `Retry-After` as delay-seconds or an HTTP date, in ms from `now`, capped at `capMs`; null if absent/unreadable. */
export function parseRetryAfterMs(
  header: string | null,
  now: number,
  capMs: number
): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, capMs);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - now), capMs);
}

function isKnown(fit: WorkbenchFitSummary, boundary: PassHead | null): boolean {
  if (boundary === null) return false;
  return boundary.ids.includes(fit.id) || fit.dateAdded <= boundary.dateAdded;
}

function headOf(fits: readonly WorkbenchFitSummary[]): PassHead | null {
  if (fits.length === 0) return null;
  return {
    ids: fits.map((fit) => fit.id),
    dateAdded: Math.max(...fits.map((fit) => fit.dateAdded)),
  };
}

export interface PagePlan {
  /** The page's fits newer than anything stored — the ones to fetch EFT for. */
  fresh: WorkbenchFitSummary[];
  /** The pass ended on this page: it reached a stored fit or the end of the list. */
  done: boolean;
  /** State to save once this page's fits are stored. */
  nextState: WorkbenchSyncState;
}

/** What one page means for a pass: which fits are new, and where the pass goes next. */
export function planPage(
  state: WorkbenchSyncState,
  page: PublicFitsPage,
  pageNumber: number
): PagePlan {
  const head = state.pass?.head ?? headOf(page.fits);
  const firstKnown = page.fits.findIndex((fit) => isKnown(fit, state.boundary));
  const fresh = firstKnown === -1 ? page.fits : page.fits.slice(0, firstKnown);
  const done = firstKnown !== -1 || page.rowCount === 0 || pageNumber >= page.numberOfPages;
  if (done || head === null) {
    return { fresh, done: true, nextState: { boundary: head ?? state.boundary, pass: null } };
  }
  return {
    fresh,
    done: false,
    nextState: { boundary: state.boundary, pass: { nextPage: pageNumber + 1, head } },
  };
}

function newestFirst(a: StoredWorkbenchFit, b: StoredWorkbenchFit): number {
  return b.dateAdded - a.dateAdded || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A hull's stored fits plus a run's new ones: one per id (the newer copy wins), newest first. */
export function mergeHullFits(
  existing: readonly StoredWorkbenchFit[],
  incoming: readonly StoredWorkbenchFit[]
): StoredWorkbenchFit[] {
  const byId = new Map<string, StoredWorkbenchFit>();
  for (const fit of existing) byId.set(fit.id, fit);
  for (const fit of incoming) byId.set(fit.id, fit);
  return [...byId.values()].sort(newestFirst);
}

/** One HTTP response, reduced to what the sync reads. */
export interface FetchJsonResult {
  status: number;
  retryAfter: string | null;
  /** Parsed JSON for a 2xx; anything for the rest. */
  body: unknown;
}

/** Where `runWorkbenchSync` keeps its state and fits. */
export interface WorkbenchFitsStore {
  readState(): Promise<WorkbenchSyncState>;
  saveState(state: WorkbenchSyncState): Promise<void>;
  /** Every stored fit for the hull; none when it has no object yet. */
  readHull(shipTypeId: number): Promise<StoredWorkbenchFit[]>;
  /** Replaces the hull's object with these fits. */
  writeHull(shipTypeId: number, fits: StoredWorkbenchFit[]): Promise<void>;
}

export interface WorkbenchSyncDeps {
  store: WorkbenchFitsStore;
  fetchJson: (url: string) => Promise<FetchJsonResult>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Wall-clock budget for fetching; the flush to the store comes after it. */
  budgetMs: number;
  /** Pause before every request but the first — the pacing Workbench gets. */
  requestGapMs: number;
}

export interface WorkbenchSyncResult {
  /** Pages fully processed (and checkpointed) this run. */
  pages: number;
  fitsStored: number;
  eftSkipped: number;
  /** Hulls whose object was rewritten: only those this run actually changed. */
  hullsWritten: number;
  passComplete: boolean;
  /** Why the run stopped short of finishing its pass, if it did. */
  stoppedBy: string | null;
}

class StopRun extends Error {}

/**
 * One scheduled run: walk pages from the checkpoint until the pass completes,
 * the budget runs out, or Workbench stops answering; then merge the run's
 * fits into their hulls and save the checkpoint — fits first, so a crash
 * between the two re-walks pages rather than skipping them. A page is only
 * counted once all its EFTs are in; a page cut short is left for next run.
 */
export async function runWorkbenchSync(deps: WorkbenchSyncDeps): Promise<WorkbenchSyncResult> {
  const { store, fetchJson, now, sleep, budgetMs, requestGapMs } = deps;
  const start = now();
  let requests = 0;

  async function request(url: string): Promise<FetchJsonResult> {
    for (let attempt = 1; ; attempt += 1) {
      if (requests > 0) await sleep(requestGapMs);
      if (now() - start >= budgetMs) throw new StopRun('budget');
      requests += 1;
      let response: FetchJsonResult;
      try {
        response = await fetchJson(url);
      } catch {
        // A network failure: status 0, retried like a 5xx.
        response = { status: 0, retryAfter: null, body: null };
      }
      const retryable = response.status === 0 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) return response;
      const asked = parseRetryAfterMs(response.retryAfter, now(), Number.POSITIVE_INFINITY);
      // Asked to back off longer than a run should idle: stop here, checkpointed.
      // The next scheduled run (12 hours on) is the retry — one request, not a burst.
      if (asked !== null && asked > MAX_RETRY_WAIT_MS) {
        throw new StopRun(`${url}: Retry-After ${Math.ceil(asked / 1000)}s`);
      }
      const wait = asked ?? SERVER_ERROR_BACKOFF_MS * attempt;
      if (now() - start + wait >= budgetMs) throw new StopRun('budget');
      await sleep(wait);
    }
  }

  let state = await store.readState();
  const byHull = new Map<number, StoredWorkbenchFit[]>();
  let pages = 0;
  let fitsStored = 0;
  let eftSkipped = 0;
  let passComplete = false;
  let stoppedBy: string | null = null;

  try {
    for (;;) {
      const pageNumber = state.pass?.nextPage ?? 1;
      const listed = await request(publicFitsPageUrl(pageNumber));
      if (listed.status !== 200) {
        throw new StopRun(`page ${pageNumber}: HTTP ${listed.status}`);
      }
      let page: PublicFitsPage;
      try {
        page = parsePublicFitsPage(listed.body);
      } catch (err) {
        throw new StopRun(err instanceof Error ? err.message : String(err));
      }
      const plan = planPage(state, page, pageNumber);

      const pageFits: [number, StoredWorkbenchFit][] = [];
      let pageSkipped = 0;
      for (const fit of plan.fresh) {
        const response = await request(fitEftUrl(fit.id));
        if (response.status === 404) {
          pageSkipped += 1;
          continue;
        }
        if (response.status !== 200) throw new StopRun(`EFT ${fit.id}: HTTP ${response.status}`);
        const eft = parseEftResponse(response.body);
        if (eft === null) {
          pageSkipped += 1;
          continue;
        }
        const { shipTypeId, ...rest } = fit;
        pageFits.push([shipTypeId, { ...rest, eft }]);
      }

      for (const [shipTypeId, stored] of pageFits) {
        const list = byHull.get(shipTypeId) ?? [];
        list.push(stored);
        byHull.set(shipTypeId, list);
      }
      fitsStored += pageFits.length;
      eftSkipped += pageSkipped;
      pages += 1;
      state = plan.nextState;
      if (plan.done) {
        passComplete = true;
        break;
      }
    }
  } catch (err) {
    if (!(err instanceof StopRun)) throw err;
    stoppedBy = err.message;
  }

  // Changed-only: a hull whose merge adds or alters nothing (a resumed page
  // re-seeing fits it already stored) costs a read but no write.
  let hullsWritten = 0;
  for (const [shipTypeId, incoming] of byHull) {
    const existing = await store.readHull(shipTypeId);
    const merged = mergeHullFits(existing, incoming);
    if (sameFits(merged, existing)) continue;
    await store.writeHull(shipTypeId, merged);
    hullsWritten += 1;
  }
  await store.saveState(state);

  return { pages, fitsStored, eftSkipped, hullsWritten, passComplete, stoppedBy };
}
