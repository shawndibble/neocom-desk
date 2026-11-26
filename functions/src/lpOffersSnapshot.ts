import { ESI_ROOT } from './esiClient.js';
import { isFiniteNumber, isPlainRecord } from './guards.js';
import { parseRetryAfterMs } from './workbenchFits.js';
export const LP_STORE_REQUEST_GAP_MS = 200;
const RATE_LIMIT_RETRIES = 3;
const RETRY_AFTER_CAP_MS = 60_000;
const DEFAULT_RETRY_MS = 5_000;

export type LpSnapshotOffer = [number, number, number, number, number, Array<[number, number]>];

export interface LpStoreRow {
  corporationId: number;
  systemIds: number[];
  offers: LpSnapshotOffer[];
}

export interface FetchJsonResult {
  status: number;
  retryAfter: string | null;
  body: unknown;
}

export function lpOffersUrl(corporationId: number): string {
  return `${ESI_ROOT}/loyalty/stores/${corporationId}/offers/`;
}

function num(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

export function parseLpOffers(body: unknown): LpSnapshotOffer[] {
  if (!Array.isArray(body)) return [];
  const offers: LpSnapshotOffer[] = [];
  for (const raw of body as unknown[]) {
    if (!isPlainRecord(raw)) continue;
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
        if (!isPlainRecord(item)) continue;
        const itemType = num(item.type_id);
        const itemQuantity = num(item.quantity);
        if (itemType !== null && itemQuantity !== null) required.push([itemType, itemQuantity]);
      }
    }
    offers.push([offerId, typeId, quantity, iskCost, lpCost, required]);
  }
  return offers;
}

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
  corporations: Readonly<Record<number, readonly number[]>>;
  fetchJson: (url: string) => Promise<FetchJsonResult>;
  sleep: (ms: number) => Promise<void>;
  requestGapMs: number;
}

export interface FetchLpStoreRowsResult {
  rows: LpStoreRow[];
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
    if (result.status === 404) continue;
    if (result.status < 200 || result.status >= 300) {
      failed.push(id);
      continue;
    }
    if (!Array.isArray(result.body)) {
      failed.push(id);
      continue;
    }
    const row = buildLpStoreRow(id, deps.corporations[id], result.body);
    if (row !== null) rows.push(row);
  }
  return { rows, failed };
}
