/**
 * Pure pieces of the R2 courier writer (ADR 0019, issue #3748): the whole
 * Public Courier Contracts snapshot as one content-addressed object, and the
 * `index.json` that names it. One object, not one per route or region: the
 * snapshot is under ~620 rows (a few tens of KB gzipped), so splitting it would
 * add requests for nothing.
 */
import { createHash } from 'node:crypto';
import type { PublicCourierContractRow } from './publicContracts.js';

const OBJECT_PREFIX = 'courier-contracts/rows.';
export const COURIER_R2_INDEX_KEY = 'courier-contracts/index.json';

/** Hex chars of the content hash kept in an object name. */
const HASH_LENGTH = 16;

export interface CourierObject {
  /** Object key within the bucket. */
  name: string;
  /** Hash of the rows; the name carries it. */
  hash: string;
  /** JSON array of the rows. */
  body: string;
}

export interface CourierContractR2Index {
  lastSyncedAt: number;
  count: number;
  object: string;
}

/** Sorting the serialized rows makes the body, and so its hash, independent of row order. */
export function buildCourierObject(rows: readonly PublicCourierContractRow[]): CourierObject {
  const body = `[${rows
    .map((r) => JSON.stringify(r))
    .sort()
    .join(',')}]`;
  const hash = createHash('sha256').update(body).digest('hex').slice(0, HASH_LENGTH);
  return { name: `${OBJECT_PREFIX}${hash}.json`, hash, body };
}

export function buildCourierContractR2Index(
  object: CourierObject,
  count: number,
  lastSyncedAt: number
): CourierContractR2Index {
  return { lastSyncedAt, count, object: object.name };
}
