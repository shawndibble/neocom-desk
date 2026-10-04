/**
 * EVE Workbench fits by hull (issue #2484): the sync behind the Popular fit
 * panel's EVE Workbench tab.
 *
 * EVE Workbench's public list (`GET /v1/fits/public?page=N`) is newest first,
 * 100 a page, and has no hull filter — so the app can't ask it for "this
 * hull's fits". This keeps our own copy instead: every public fit's summary
 * and EFT, grouped by hull into `workbenchFits` docs the client reads by
 * id (`{shipTypeId}_{part}`). See the decision doc this ships with.
 *
 * Everything here is fetch- and Firestore-free: `runWorkbenchSync` takes the
 * HTTP call, the clock and the store as arguments, so paging, stop-at-known,
 * checkpointing, retry and splitting are all unit-tested.
 * `workbenchFitsStore.ts` is the Firestore side; `index.ts` only schedules.
 *
 * **Passes.** A pass walks the list from page 1 until it reaches a fit an
 * earlier pass already stored (or the end of the list). The first pass walks
 * all ~385 pages and fetches ~38k EFTs — far more than one 540s invocation —
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

export const WORKBENCH_FITS_COLLECTION = 'workbenchFits';
/** Sync bookkeeping; deliberately its own collection so the public read rule on fits doesn't expose it. */
export const WORKBENCH_SYNC_STATE_COLLECTION = 'workbenchFitsSync';
export const WORKBENCH_SYNC_STATE_DOC = 'state';
export const WORKBENCH_API_BASE = 'https://api.eveworkbench.com/v1';

/**
 * A hull part's byte ceiling, against Firestore's 1 MiB document limit. The
 * estimate (`fitBytes`) is JSON length, which over-counts Firestore's own
 * encoding (a 13-digit number is 8 bytes stored), so this leaves headroom
 * for the doc's other fields and field names.
 */
export const HULL_PART_BYTE_BUDGET = 900_000;
/** Fixed allowance per part for `shipTypeId`, `part`, `parts` and the `fits` field name. */
const PART_OVERHEAD_BYTES = 64;

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

/** One fit as stored in a hull part — everything the tab lists, plus the EFT that Loads it. */
export interface StoredWorkbenchFit {
  id: string;
  name: string;
  authorId: number | null;
  authorName: string;
  dateAdded: number;
  eft: string;
}

/** One `workbenchFits` document: a slice of one hull's fits, newest first. */
export interface HullPartDoc {
  shipTypeId: number;
  part: number;
  /**
   * Part 0 only: how many parts the hull has. Clients can only `get` these
   * docs by id (listing is denied), so this is how they learn which other
   * parts to fetch.
   */
  parts?: number;
  fits: StoredWorkbenchFit[];
}

/** One write in `planHullWrite`'s plan. */
export type HullWriteOp =
  { kind: 'set'; docId: string; doc: HullPartDoc } | { kind: 'delete'; docId: string };

/**
 * Part docs per `WriteBatch`. A part can be ~900KB, and `commit()` encodes
 * the whole batch at once — the same reason the public-contract snapshot
 * writes 5 chunk docs per batch, and well under Firestore's request size cap.
 */
export const PART_DOCS_PER_BATCH = 5;

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

/** `hullPartDocId(626, 0)` → `626_0`. */
export function hullPartDocId(shipTypeId: number, part: number): string {
  return `${shipTypeId}_${part}`;
}

/**
 * How many parts a hull has, from its part 0 doc (`undefined` when there is
 * none: no fits). A part 0 without a usable `parts` count was written before
 * the count existed, when the client still found parts by query — read it as
 * the one part it can vouch for. Mirrored by the client's reader.
 */
export function hullPartCount(part0: unknown): number {
  if (!isRecord(part0)) return 0;
  const { parts } = part0;
  return typeof parts === 'number' && Number.isInteger(parts) && parts >= 1 ? parts : 1;
}

/**
 * The writes that replace a hull's `previousPartCount` parts with `parts`, as
 * batches to commit in order. A reader fetches part 0, then the parts its
 * `parts` count claims — so the order guarantees part 0 never claims a part
 * that doesn't exist, after any batch:
 *
 * - Parts are set last first, and part 0 (carrying the new count) after
 *   every other part, so the parts a new count claims all exist before the
 *   count does. Until then the old part 0's old count stands, and the old
 *   parts it claims are still there: nothing is deleted yet. Parts are
 *   newest first, so new fits push older ones into later parts; writing the
 *   later parts first leaves a fit in two parts mid-write (the client dedupes
 *   by id) rather than overwritten out of both. A reader still holding the
 *   old count can miss a fit pushed past it until it reads again — the count
 *   bounds what is fetched, it doesn't make the read a snapshot. Accepted.
 * - Deletes (parts past the new count) go after part 0, by which point no
 *   count claims them. With no parts left at all, part 0 is the first delete,
 *   so the hull reads as empty before its other parts go.
 *
 * A run that dies mid-way leaves pages un-checkpointed, so the next run
 * re-merges the same fits and rewrites the hull — and its `readHull` finds
 * parts by query, past any count, so nothing is stranded.
 */
export function planHullWrite(
  shipTypeId: number,
  parts: readonly StoredWorkbenchFit[][],
  previousPartCount: number
): HullWriteOp[][] {
  const ops: HullWriteOp[] = [];
  for (let part = parts.length - 1; part >= 0; part -= 1) {
    const doc: HullPartDoc = { shipTypeId, part, fits: parts[part] };
    if (part === 0) doc.parts = parts.length;
    ops.push({ kind: 'set', docId: hullPartDocId(shipTypeId, part), doc });
  }
  for (let part = parts.length; part < previousPartCount; part += 1) {
    ops.push({ kind: 'delete', docId: hullPartDocId(shipTypeId, part) });
  }
  const batches: HullWriteOp[][] = [];
  for (let i = 0; i < ops.length; i += PART_DOCS_PER_BATCH) {
    batches.push(ops.slice(i, i + PART_DOCS_PER_BATCH));
  }
  return batches;
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

function fitBytes(fit: StoredWorkbenchFit): number {
  return Buffer.byteLength(JSON.stringify(fit), 'utf8');
}

/**
 * Slices a hull's fits (already newest first) into parts that each fit one
 * Firestore document. A fit too big for a document on its own is dropped —
 * no split can store it.
 */
export function splitHullParts(
  fits: readonly StoredWorkbenchFit[],
  byteBudget: number = HULL_PART_BYTE_BUDGET
): StoredWorkbenchFit[][] {
  const parts: StoredWorkbenchFit[][] = [];
  let current: StoredWorkbenchFit[] = [];
  let used = PART_OVERHEAD_BYTES;
  for (const fit of fits) {
    const bytes = fitBytes(fit);
    if (PART_OVERHEAD_BYTES + bytes > byteBudget) continue;
    if (used + bytes > byteBudget) {
      parts.push(current);
      current = [];
      used = PART_OVERHEAD_BYTES;
    }
    current.push(fit);
    used += bytes;
  }
  if (current.length > 0) parts.push(current);
  return parts;
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
  /**
   * Every stored fit for the hull, and how many part docs hold them now —
   * every part doc that exists, not just the ones part 0's count claims, so a
   * crashed run's leftovers are re-merged and then deleted.
   */
  readHull(shipTypeId: number): Promise<{ fits: StoredWorkbenchFit[]; partCount: number }>;
  /** Replaces the hull's parts with these, in `planHullWrite`'s order; parts past `parts.length` (up to `previousPartCount`) are deleted. */
  writeHull(
    shipTypeId: number,
    parts: StoredWorkbenchFit[][],
    previousPartCount: number
  ): Promise<void>;
}

export interface WorkbenchSyncDeps {
  store: WorkbenchFitsStore;
  fetchJson: (url: string) => Promise<FetchJsonResult>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Wall-clock budget for fetching; the flush to Firestore comes after it. */
  budgetMs: number;
  /** Pause before every request but the first — the pacing Workbench gets. */
  requestGapMs: number;
  partByteBudget?: number;
}

export interface WorkbenchSyncResult {
  /** Pages fully processed (and checkpointed) this run. */
  pages: number;
  fitsStored: number;
  eftSkipped: number;
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
      // The next scheduled run (30 minutes on) is the retry — one request, not a burst.
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

  for (const [shipTypeId, incoming] of byHull) {
    const existing = await store.readHull(shipTypeId);
    const parts = splitHullParts(mergeHullFits(existing.fits, incoming), deps.partByteBudget);
    await store.writeHull(shipTypeId, parts, existing.partCount);
  }
  await store.saveState(state);

  return { pages, fitsStored, eftSkipped, hullsWritten: byHull.size, passComplete, stoppedBy };
}
