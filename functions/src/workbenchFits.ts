import { isRecord } from './guards.js';

export const WORKBENCH_FITS_R2_PREFIX = 'workbench-fits/';
export const WORKBENCH_SYNC_STATE_R2_KEY = 'workbench-fits-state/state.json';
export const WORKBENCH_API_BASE = 'https://api.eveworkbench.com/v1';

const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 60_000;
const SERVER_ERROR_BACKOFF_MS = 2_000;

export interface WorkbenchFitSummary {
  id: string;
  name: string;
  shipTypeId: number;
  authorId: number | null;
  authorName: string;
  dateAdded: number;
}

export interface StoredWorkbenchFit {
  id: string;
  name: string;
  authorId: number | null;
  authorName: string;
  dateAdded: number;
  eft: string;
}

export interface PassHead {
  ids: string[];
  dateAdded: number;
}

export interface WorkbenchSyncState {
  boundary: PassHead | null;
  pass: { nextPage: number; head: PassHead } | null;
}

export interface PublicFitsPage {
  numberOfPages: number;
  rowCount: number;
  fits: WorkbenchFitSummary[];
}

export function workbenchFitsR2Key(shipTypeId: number): string {
  return `${WORKBENCH_FITS_R2_PREFIX}${shipTypeId}.json`;
}

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

export function parseEftResponse(body: unknown): string | null {
  if (!isRecord(body) || body.Error === true) return null;
  return typeof body.Eft === 'string' && body.Eft.trim().length > 0 ? body.Eft : null;
}

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
  fresh: WorkbenchFitSummary[];
  done: boolean;
  nextState: WorkbenchSyncState;
}

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

export function mergeHullFits(
  existing: readonly StoredWorkbenchFit[],
  incoming: readonly StoredWorkbenchFit[]
): StoredWorkbenchFit[] {
  const byId = new Map<string, StoredWorkbenchFit>();
  for (const fit of existing) byId.set(fit.id, fit);
  for (const fit of incoming) byId.set(fit.id, fit);
  return [...byId.values()].sort(newestFirst);
}

export interface FetchJsonResult {
  status: number;
  retryAfter: string | null;
  body: unknown;
}

export interface WorkbenchFitsStore {
  readState(): Promise<WorkbenchSyncState>;
  saveState(state: WorkbenchSyncState): Promise<void>;
  readHull(shipTypeId: number): Promise<StoredWorkbenchFit[]>;
  writeHull(shipTypeId: number, fits: StoredWorkbenchFit[]): Promise<void>;
}

export interface WorkbenchSyncDeps {
  store: WorkbenchFitsStore;
  fetchJson: (url: string) => Promise<FetchJsonResult>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  budgetMs: number;
  requestGapMs: number;
}

export interface WorkbenchSyncResult {
  pages: number;
  fitsStored: number;
  eftSkipped: number;
  hullsWritten: number;
  passComplete: boolean;
  stoppedBy: string | null;
}

class StopRun extends Error {}

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
        response = { status: 0, retryAfter: null, body: null };
      }
      const retryable = response.status === 0 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) return response;
      const asked = parseRetryAfterMs(response.retryAfter, now(), Number.POSITIVE_INFINITY);
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
