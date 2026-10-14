/**
 * Pure pieces of the R2 offers writer (ADR 0019, issue #3745): group rows into
 * one content-addressed object per item type, split an oversized type by
 * region, and build the `index.json` that names the objects.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildContractOfferIndex, type PublicContractOfferRow } from './publicContracts.js';

const TYPE_OBJECT_PREFIX = 'contract-offers/types/';
export const R2_INDEX_KEY = 'contract-offers/index.json';

/** Hex chars of the content hash kept in an object name. */
const HASH_LENGTH = 16;

/** Uncompressed bytes above which a type is split by region. */
export const MAX_OBJECT_BYTES = 4_000_000;

export interface TypeObjectPart {
  /** Object key within the bucket. */
  name: string;
  /** Set when the type was split by region. */
  regionId?: number;
  /** JSON array of this part's rows. */
  body: string;
}

export interface TypeObject {
  typeId: number;
  /** Hash of the whole type's rows; every part's name carries it. */
  hash: string;
  parts: TypeObjectPart[];
}

export interface ContractOfferR2Index {
  lastSyncedAt: number;
  types: Record<string, { count: number; cheapest: number | null; objects: string[] }>;
  regionIds: number[];
}

export function typeObjectName(typeId: number, hash: string, regionId?: number): string {
  const region = regionId === undefined ? '' : `r${regionId}.`;
  return `${TYPE_OBJECT_PREFIX}${typeId}.${region}${hash}.json`;
}

/** Sorting the serialized rows makes the body, and so its hash, independent of row order. */
function bodyOf(rows: readonly PublicContractOfferRow[]): string {
  return `[${rows
    .map((r) => JSON.stringify(r))
    .sort()
    .join(',')}]`;
}

export function buildTypeObjects(
  rows: readonly PublicContractOfferRow[],
  { maxObjectBytes = MAX_OBJECT_BYTES }: { maxObjectBytes?: number } = {}
): TypeObject[] {
  const byType = new Map<number, PublicContractOfferRow[]>();
  for (const row of rows) {
    const list = byType.get(row.typeId);
    if (list) list.push(row);
    else byType.set(row.typeId, [row]);
  }

  const objects: TypeObject[] = [];
  for (const [typeId, typeRows] of byType) {
    const body = bodyOf(typeRows);
    const hash = createHash('sha256').update(body).digest('hex').slice(0, HASH_LENGTH);
    if (Buffer.byteLength(body) <= maxObjectBytes) {
      objects.push({ typeId, hash, parts: [{ name: typeObjectName(typeId, hash), body }] });
      continue;
    }
    const byRegion = new Map<number, PublicContractOfferRow[]>();
    for (const row of typeRows) {
      const list = byRegion.get(row.regionId);
      if (list) list.push(row);
      else byRegion.set(row.regionId, [row]);
    }
    const parts = [...byRegion]
      .sort(([a], [b]) => a - b)
      .map(([regionId, regionRows]) => ({
        name: typeObjectName(typeId, hash, regionId),
        regionId,
        body: bodyOf(regionRows),
      }));
    objects.push({ typeId, hash, parts });
  }
  return objects;
}

export function gzipObjectBody(body: string): Buffer {
  return gzipSync(body);
}

/** Same per-type facts the Firestore index carries, plus the object names. */
export function buildContractOfferR2Index(
  rows: readonly PublicContractOfferRow[],
  objects: readonly TypeObject[],
  lastSyncedAt: number
): ContractOfferR2Index {
  // A chunk size no row position reaches: only count, cheapest and regions are used.
  const base = buildContractOfferIndex(rows, Number.MAX_SAFE_INTEGER);
  const types: ContractOfferR2Index['types'] = {};
  for (const object of objects) {
    const [count, cheapest] = base.types[String(object.typeId)];
    types[String(object.typeId)] = { count, cheapest, objects: object.parts.map((p) => p.name) };
  }
  return { lastSyncedAt, types, regionIds: base.regionIds };
}
