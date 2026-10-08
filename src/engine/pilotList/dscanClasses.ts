/**
 * Counts a pasted D-Scan into class buckets by SDE group (issue #2863). Group
 * ids are pinned here rather than baked into the SDE because `types.json`
 * carries only a type's group id; the tests pin each id to its bucket.
 */

export type DscanBucket = 'capitals' | 'logistics' | 'structures' | 'wrecks' | 'ships';

export interface DscanTypeInfo {
  groupId: number;
  categoryId: number;
}

export interface DscanClass {
  bucket: DscanBucket;
  total: number;
  /** Each type once, most numerous first. */
  types: { typeId: number; count: number }[];
}

export interface DscanSummary {
  /** Non-empty buckets, in display order. */
  classes: DscanClass[];
  /** Drones, probes, celestials and types the SDE doesn't know. */
  leftOut: number;
}

const SHIP_CATEGORY = 6;

/** Carrier, Dreadnought, Supercarrier, Titan, Force Auxiliary, Lancer Dreadnought, Capital Industrial. */
const CAPITAL_GROUPS = new Set([547, 485, 659, 30, 1538, 4594, 883]);
/** Logistics Cruiser, Logistics Frigate. */
const LOGISTICS_GROUPS = new Set([832, 1527]);
/** Citadel, Engineering Complex, Refinery, Control Tower, Customs Office. */
const STRUCTURE_GROUPS = new Set([1657, 1404, 1406, 365, 1025]);
/** Ship Wreck. */
const WRECK_GROUPS = new Set([186]);

const ORDER: readonly DscanBucket[] = ['capitals', 'logistics', 'structures', 'wrecks', 'ships'];

function bucketOf({ groupId, categoryId }: DscanTypeInfo): DscanBucket | null {
  if (CAPITAL_GROUPS.has(groupId)) return 'capitals';
  if (LOGISTICS_GROUPS.has(groupId)) return 'logistics';
  if (STRUCTURE_GROUPS.has(groupId)) return 'structures';
  if (WRECK_GROUPS.has(groupId)) return 'wrecks';
  return categoryId === SHIP_CATEGORY ? 'ships' : null;
}

export function bucketDscan(
  typeIds: readonly number[],
  infoOf: (typeId: number) => DscanTypeInfo | undefined
): DscanSummary {
  const counts = new Map<DscanBucket, Map<number, number>>();
  let leftOut = 0;
  for (const typeId of typeIds) {
    const info = infoOf(typeId);
    const bucket = info === undefined ? null : bucketOf(info);
    if (bucket === null) {
      leftOut += 1;
      continue;
    }
    const types = counts.get(bucket) ?? new Map<number, number>();
    types.set(typeId, (types.get(typeId) ?? 0) + 1);
    counts.set(bucket, types);
  }
  const classes: DscanClass[] = [];
  for (const bucket of ORDER) {
    const types = counts.get(bucket);
    if (types === undefined) continue;
    const list = [...types].map(([typeId, count]) => ({ typeId, count }));
    list.sort((a, b) => b.count - a.count);
    classes.push({ bucket, total: list.reduce((sum, t) => sum + t.count, 0), types: list });
  }
  return { classes, leftOut };
}
