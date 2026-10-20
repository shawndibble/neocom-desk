/**
 * Reads the Public Courier Contracts snapshot from Cloudflare R2 (ADR 0019,
 * issue #3748): `courier-contracts/index.json` names the one
 * content-addressed object holding every row. Written by
 * `functions/src/courierContractObjects.ts`.
 *
 * Reports "unavailable" as `null`, never a throw: R2 is the only store (issue
 * #4270), so the Courier board shows its "unavailable" state. The index and the object are read
 * together, so rows and `lastSyncedAt` always come from one publish. The
 * object's name carries its hash, so the browser and the service worker keep
 * it; only the tiny index is re-read.
 */
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import type { R2Snapshot } from './r2Snapshot';
import { R2_SNAPSHOT_ORIGIN, fetchJson } from './r2OfferSnapshot';

const INDEX_URL = `${R2_SNAPSHOT_ORIGIN}/courier-contracts/index.json`;
/** What the writer names the object; anything else is not fetched. */
const OBJECT_NAME = /^courier-contracts\/rows\.[\w.-]+\.json$/;

/** `courier-contracts/index.json` as the writer produces it. */
export interface R2CourierIndex {
  lastSyncedAt: number;
  count: number;
  object: string;
}

/** The index, or `null` when it is not the shape the writer produces. */
export function parseR2CourierIndex(raw: unknown): R2CourierIndex | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lastSyncedAt, count, object } = raw as Record<string, unknown>;
  if (typeof lastSyncedAt !== 'number' || !(lastSyncedAt > 0)) return null;
  if (typeof count !== 'number' || typeof object !== 'string' || !OBJECT_NAME.test(object)) {
    return null;
  }
  return { lastSyncedAt, count, object };
}

/** The fields the Courier tab reads unguarded; a row without them would throw in a render. */
function isCourierRow(value: unknown): value is PublicCourierContractRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).contractId === 'number';
}

export async function readR2CourierSnapshot(): Promise<R2Snapshot<PublicCourierContractRow> | null> {
  try {
    const index = parseR2CourierIndex(await fetchJson(INDEX_URL));
    if (!index) return null;
    const body = await fetchJson(`${R2_SNAPSHOT_ORIGIN}/${index.object}`);
    // A length that disagrees with the index is a truncated or mismatched object.
    if (!Array.isArray(body) || body.length !== index.count || !body.every(isCourierRow)) {
      return null;
    }
    return { rows: body, lastSyncedAt: index.lastSyncedAt };
  } catch {
    return null;
  }
}
