import { createHash } from 'node:crypto';
import type { PublicCourierContractRow } from './publicContracts.js';

const OBJECT_PREFIX = 'courier-contracts/rows.';
export const COURIER_R2_INDEX_KEY = 'courier-contracts/index.json';

const HASH_LENGTH = 16;

export interface CourierObject {
  name: string;
  hash: string;
  body: string;
}

export interface CourierContractR2Index {
  lastSyncedAt: number;
  count: number;
  object: string;
}

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
