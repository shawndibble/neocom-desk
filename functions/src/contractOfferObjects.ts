import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildContractOfferIndex, type PublicContractOfferRow } from './publicContracts.js';

const BUNDLE_OBJECT_PREFIX = 'contract-offers/bundles/';
export const R2_INDEX_KEY = 'contract-offers/index.json';

const HASH_LENGTH = 16;

export const MAX_BUNDLE_BYTES = 1_000_000;

export type BundleGroup = 'blueprints' | 'others';

export interface BundleObjectPart {
  name: string;
  body: string;
  typeIds: number[];
}

export type BundleObjects = Record<BundleGroup, BundleObjectPart[]>;

export interface ContractOfferR2Index {
  lastSyncedAt: number;
  types: Record<string, { count: number; cheapest: number | null; objects: string[] }>;
  regionIds: number[];
  bundles: Record<BundleGroup, string[]>;
}

export function bundleObjectName(group: BundleGroup, shard: number, hash: string): string {
  return `${BUNDLE_OBJECT_PREFIX}${group}.${shard}.${hash}.json`;
}

function contentHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, HASH_LENGTH);
}

export function buildBundleObjects(
  rows: readonly PublicContractOfferRow[],
  { maxBundleBytes = MAX_BUNDLE_BYTES }: { maxBundleBytes?: number } = {}
): BundleObjects {
  const byType = new Map<number, string[]>();
  const blueprintTypes = new Set<number>();
  for (const row of rows) {
    const list = byType.get(row.typeId);
    if (list) list.push(JSON.stringify(row));
    else byType.set(row.typeId, [JSON.stringify(row)]);
    if (row.isBlueprintCopy || row.me !== undefined) blueprintTypes.add(row.typeId);
  }
  const bundles: BundleObjects = { blueprints: [], others: [] };
  const open: Record<BundleGroup, { items: string[]; bytes: number; typeIds: number[] }> = {
    blueprints: { items: [], bytes: 0, typeIds: [] },
    others: { items: [], bytes: 0, typeIds: [] },
  };
  const close = (group: BundleGroup) => {
    const shard = open[group];
    if (shard.items.length === 0) return;
    const body = `[${shard.items.join(',')}]`;
    bundles[group].push({
      name: bundleObjectName(group, bundles[group].length, contentHash(body)),
      body,
      typeIds: shard.typeIds,
    });
    open[group] = { items: [], bytes: 0, typeIds: [] };
  };
  for (const [typeId, serialized] of [...byType].sort(([a], [b]) => a - b)) {
    const group: BundleGroup = blueprintTypes.has(typeId) ? 'blueprints' : 'others';
    const inner = serialized.sort().join(',');
    open[group].typeIds.push(typeId);
    open[group].items.push(inner);
    open[group].bytes += inner.length + 1;
    if (open[group].bytes >= maxBundleBytes) close(group);
  }
  close('blueprints');
  close('others');
  return bundles;
}

export function gzipObjectBody(body: string): Buffer {
  return gzipSync(body);
}

export function buildContractOfferR2Index(
  rows: readonly PublicContractOfferRow[],
  bundles: BundleObjects,
  lastSyncedAt: number
): ContractOfferR2Index {
  const base = buildContractOfferIndex(rows);
  const types: ContractOfferR2Index['types'] = {};
  for (const part of [...bundles.blueprints, ...bundles.others]) {
    for (const typeId of part.typeIds) {
      const [count, cheapest] = base.types[String(typeId)];
      types[String(typeId)] = { count, cheapest, objects: [part.name] };
    }
  }
  return {
    lastSyncedAt,
    types,
    regionIds: base.regionIds,
    bundles: {
      blueprints: bundles.blueprints.map((part) => part.name),
      others: bundles.others.map((part) => part.name),
    },
  };
}
