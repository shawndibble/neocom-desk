/**
 * The LP Store search snapshot (issue #2873): every NPC corporation's LP Store
 * offers plus the solar systems the corporation has stations in, republished to
 * `lpStoreOffers` for the LP Store page's item-first search.
 *
 * ESI's offers carry no home station, so the snapshot ships all of a
 * corporation's station systems and the client picks the one nearest the
 * Current System. Prices are deliberately not here: ISK/LP is computed
 * client-side from current prices.
 *
 * Fetch- and Firestore-free like `workbenchFits.ts`: the HTTP call and sleep
 * are arguments, so parsing, joining, retry and the drop rules are unit-tested.
 * `index.ts` supplies `fetch` and writes the chunks.
 */
import { parseRetryAfterMs } from './workbenchFits.js';

export const LP_STORE_OFFERS_COLLECTION = 'lpStoreOffers';
export const LP_STORE_OFFERS_META_DOC = 'meta';
/** Corporation rows per chunk doc: ~170 stores of up to a few hundred offers each stay well under Firestore's 1 MiB doc limit. */
export const LP_STORE_OFFERS_CHUNK_SIZE = 15;
const ESI_BASE_URL = 'https://esi.evetech.net';
/** Courtesy gap between corporation requests (~170 requests a day). */
export const LP_STORE_REQUEST_GAP_MS = 200;
const RATE_LIMIT_RETRIES = 3;
const RETRY_AFTER_CAP_MS = 60_000;
const DEFAULT_RETRY_MS = 5_000;

/** `[offerId, typeId, quantity, iskCost, lpCost, requiredItems: [typeId, quantity][]]` */
export type LpSnapshotOffer = [number, number, number, number, number, Array<[number, number]>];

export interface LpStoreRow {
  corporationId: number;
  /** Solar systems with a station owned by this corporation, ascending. */
  systemIds: number[];
  offers: LpSnapshotOffer[];
}

export interface FetchJsonResult {
  status: number;
  retryAfter: string | null;
  body: unknown;
}

export function lpOffersUrl(corporationId: number): string {
  return `${ESI_BASE_URL}/loyalty/stores/${corporationId}/offers/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** ESI's offer list -> compact tuples. Anything malformed is skipped, never thrown on. */
export function parseLpOffers(body: unknown): LpSnapshotOffer[] {
  if (!Array.isArray(body)) return [];
  const offers: LpSnapshotOffer[] = [];
  for (const raw of body as unknown[]) {
    if (!isRecord(raw)) continue;
    const offerId = num(raw.offer_id);
    const typeId = num(raw.type_id);
    const quantity = num(raw.quantity);
    const iskCost = num(raw.isk_cost);
    const lpCost = num(raw.lp_cost);
    if (
      offerId === null ||
      typeId === null ||
      quantity === null ||
      iskCost === null ||
      lpCost === null
    ) {
      continue;
    }
    const required: Array<[number, number]> = [];
    if (Array.isArray(raw.required_items)) {
      for (const item of raw.required_items as unknown[]) {
        if (!isRecord(item)) continue;
        const itemType = num(item.type_id);
        const itemQuantity = num(item.quantity);
        if (itemType !== null && itemQuantity !== null) required.push([itemType, itemQuantity]);
      }
    }
    offers.push([offerId, typeId, quantity, iskCost, lpCost, required]);
  }
  return offers;
}

/** The corporation's row, or null when it has no station systems or no offers to search. */
export function buildLpStoreRow(
  corporationId: number,
  systemIds: readonly number[],
  body: unknown
): LpStoreRow | null {
  if (systemIds.length === 0) return null;
  const offers = parseLpOffers(body);
  if (offers.length === 0) return null;
  return { corporationId, systemIds: [...systemIds], offers };
}

export interface FetchLpStoreRowsDeps {
  /** Corporation id -> its station systems (the baked `LP_CORP_STATION_SYSTEMS`). */
  corporations: Readonly<Record<number, readonly number[]>>;
  fetchJson: (url: string) => Promise<FetchJsonResult>;
  sleep: (ms: number) => Promise<void>;
  requestGapMs: number;
}

export interface FetchLpStoreRowsResult {
  rows: LpStoreRow[];
  /** Corporations whose request never succeeded: missing from `rows` by error, not because they have no store. */
  failed: number[];
}

async function fetchOffers(
  corporationId: number,
  deps: FetchLpStoreRowsDeps
): Promise<FetchJsonResult> {
  let result = await deps.fetchJson(lpOffersUrl(corporationId));
  for (let retry = 0; retry < RATE_LIMIT_RETRIES; retry += 1) {
    if (result.status !== 429 && result.status !== 420) break;
    const wait = parseRetryAfterMs(result.retryAfter, Date.now(), RETRY_AFTER_CAP_MS);
    await deps.sleep(wait ?? DEFAULT_RETRY_MS);
    result = await deps.fetchJson(lpOffersUrl(corporationId));
  }
  return result;
}

export async function fetchLpStoreRows(
  deps: FetchLpStoreRowsDeps
): Promise<FetchLpStoreRowsResult> {
  const rows: LpStoreRow[] = [];
  const failed: number[] = [];
  const ids = Object.keys(deps.corporations)
    .map(Number)
    .filter((id) => deps.corporations[id].length > 0)
    .sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i += 1) {
    if (i > 0 && deps.requestGapMs > 0) await deps.sleep(deps.requestGapMs);
    const id = ids[i];
    let result: FetchJsonResult;
    try {
      result = await fetchOffers(id, deps);
    } catch {
      failed.push(id);
      continue;
    }
    // 404: the corporation no longer runs a store. Not a failure.
    if (result.status === 404) continue;
    if (result.status < 200 || result.status >= 300) {
      failed.push(id);
      continue;
    }
    const row = buildLpStoreRow(id, deps.corporations[id], result.body);
    if (row !== null) rows.push(row);
  }
  return { rows, failed };
}
