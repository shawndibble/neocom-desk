/**
 * Pure pieces of the R2 offers writer (ADR 0019, issue #3745): group rows into
 * one content-addressed object per item type, split an oversized type by
 * region, and build the `index.json` that names the objects. Beside them, a few
 * bundle shards hold the same rows grouped as blueprint types and the rest, for
 * a reader that needs every type: thousands of small reads take minutes where a
 * handful of big ones take seconds.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildContractOfferIndex, type PublicContractOfferRow } from './publicContracts.js';

const TYPE_OBJECT_PREFIX = 'contract-offers/types/';
const BUNDLE_OBJECT_PREFIX = 'contract-offers/bundles/';
export const R2_INDEX_KEY = 'contract-offers/index.json';

/** Hex chars of the content hash kept in an object name. */
const HASH_LENGTH = 16;

/** Uncompressed bytes above which a type is split by region. */
export const MAX_OBJECT_BYTES = 4_000_000;

/** Uncompressed bytes per bundle shard (~1 MB gzipped): few reads, none huge. */
export const MAX_BUNDLE_BYTES = 8_000_000;

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

export type BundleGroup = 'blueprints' | 'others';

export interface BundleObjectPart {
  name: string;
  body: string;
}

/** Every row, sharded: blueprint types (copies and originals) apart from the rest. */
export type BundleObjects = Record<BundleGroup, BundleObjectPart[]>;

export interface ContractOfferR2Index {
  lastSyncedAt: number;
  types: Record<string, { count: number; cheapest: number | null; objects: string[] }>;
  regionIds: number[];
  /** Bundle shard names per group; absent when the bundles were not uploaded. */
  bundles?: Record<BundleGroup, string[]>;
}

export function typeObjectName(typeId: number, hash: string, regionId?: number): string {
  const region = regionId === undefined ? '' : `r${regionId}.`;
  return `${TYPE_OBJECT_PREFIX}${typeId}.${region}${hash}.json`;
}

export function bundleObjectName(group: BundleGroup, shard: number, hash: string): string {
  return `${BUNDLE_OBJECT_PREFIX}${group}.${shard}.${hash}.json`;
}

function contentHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, HASH_LENGTH);
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
    const hash = contentHash(body);
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

/**
 * The bundle shards, built from the type objects' bodies so no row is
 * serialized twice. A type is a blueprint type when any of its rows is a copy
 * or carries ME/TE (only a blueprint does); all its rows then go with it, so
 * BPC Sourcing reads one group. Types go in id order and a shard closes once
 * past `maxBundleBytes`, so a type never straddles two shards.
 */
export function buildBundleObjects(
  objects: readonly TypeObject[],
  rows: readonly PublicContractOfferRow[],
  { maxBundleBytes = MAX_BUNDLE_BYTES }: { maxBundleBytes?: number } = {}
): BundleObjects {
  const blueprintTypes = new Set<number>();
  for (const row of rows) {
    if (row.isBlueprintCopy || row.me !== undefined) blueprintTypes.add(row.typeId);
  }
  const bundles: BundleObjects = { blueprints: [], others: [] };
  const open: Record<BundleGroup, { items: string[]; bytes: number }> = {
    blueprints: { items: [], bytes: 0 },
    others: { items: [], bytes: 0 },
  };
  const close = (group: BundleGroup) => {
    const shard = open[group];
    if (shard.items.length === 0) return;
    const body = `[${shard.items.join(',')}]`;
    bundles[group].push({
      name: bundleObjectName(group, bundles[group].length, contentHash(body)),
      body,
    });
    open[group] = { items: [], bytes: 0 };
  };
  for (const object of [...objects].sort((a, b) => a.typeId - b.typeId)) {
    const group: BundleGroup = blueprintTypes.has(object.typeId) ? 'blueprints' : 'others';
    for (const part of object.parts) {
      // A part body is a JSON array; its inside joins the shard's array.
      const inner = part.body.slice(1, -1);
      if (inner === '') continue;
      open[group].items.push(inner);
      open[group].bytes += inner.length + 1;
    }
    if (open[group].bytes >= maxBundleBytes) close(group);
  }
  close('blueprints');
  close('others');
  return bundles;
}

export function gzipObjectBody(body: string): Buffer {
  return gzipSync(body);
}

/** The per-type facts of `buildContractOfferIndex`, plus the object names. */
export function buildContractOfferR2Index(
  rows: readonly PublicContractOfferRow[],
  objects: readonly TypeObject[],
  lastSyncedAt: number,
  bundles?: BundleObjects
): ContractOfferR2Index {
  const base = buildContractOfferIndex(rows);
  const types: ContractOfferR2Index['types'] = {};
  for (const object of objects) {
    const [count, cheapest] = base.types[String(object.typeId)];
    types[String(object.typeId)] = { count, cheapest, objects: object.parts.map((p) => p.name) };
  }
  const index: ContractOfferR2Index = { lastSyncedAt, types, regionIds: base.regionIds };
  if (bundles) {
    index.bundles = {
      blueprints: bundles.blueprints.map((part) => part.name),
      others: bundles.others.map((part) => part.name),
    };
  }
  return index;
}
