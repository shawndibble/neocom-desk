/**
 * Which `public/data/typeInfo/<n>.json` shard holds a type's baked data
 * (issues #3882, #3884). `scripts/lib/typeInfo.mjs` mirrors the key;
 * `typeInfoShards.test.ts` checks they agree.
 *
 * Range buckets of TYPE_INFO_SHARD_WIDTH ids, not `id % n`: neighbouring ids
 * are near-identical types (a module's variants, a ship's skins) sharing most
 * of their text, so gzip compresses them together — ~1.36 MB over the set,
 * against ~2.9 MB scattered by modulo. A patch that only adds new types
 * usually rewrites just the top bucket, so the rest keep their `?v=` hash.
 *
 * 64 buckets cover ids below 128,000 (the highest published id is ~98,000).
 * The build fails on a published id past that; raise the count here and in
 * `scripts/lib/typeInfo.mjs` together.
 *
 * Keep this file import-free: `vite.config.ts` loads it via `lazySdeFiles.ts`,
 * where no `@/` alias exists.
 */
export const TYPE_INFO_SHARD_WIDTH = 2000;
export const TYPE_INFO_SHARD_COUNT = 64;

/** One published type's baked data, as ESI's `/universe/types/{id}` would give it. */
export interface TypeInfoRecord {
  /** English description, newlines as ESI sends them. */
  description: string;
  /** `[attributeId, value]` pairs: ESI's `dogma_attributes`, including the type-row ones (4, 38, 161, 162). */
  attributes: [number, number][];
  /** ESI's `dogma_effects` ids, ascending. Required: absent would read as "no effects". */
  effects: number[];
  /** The one effect ESI marks `is_default`, if any. */
  defaultEffect?: number;
  volume?: number;
  /** Only where it differs from `volume`. */
  packagedVolume?: number;
}

/** One shard file: type id (as a string key) -> record. */
export type TypeInfoShard = Record<string, TypeInfoRecord>;

/** The type's bucket, or null when it falls outside every bucket (none baked). */
export function typeInfoBucket(typeId: number): number | null {
  const shard = Math.floor(typeId / TYPE_INFO_SHARD_WIDTH);
  return shard >= 0 && shard < TYPE_INFO_SHARD_COUNT ? shard : null;
}

/** The shard's path under `public/data/`, as `sdeDataUrl` takes it; null as {@link typeInfoBucket}. */
export function typeInfoShardFile(typeId: number): string | null {
  const shard = typeInfoBucket(typeId);
  return shard === null ? null : `typeInfo/${shard}.json`;
}
