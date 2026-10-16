/**
 * Which `public/data/typeInfo/<n>.json` shard holds a type's baked Item Detail
 * data (description + dogma attributes, issue #3882). Shared contract with
 * `scripts/lib/typeInfo.mjs`, which writes the shards with the same key —
 * `typeInfoShards.test.ts` checks the two agree against the committed files.
 *
 * Range buckets of TYPE_INFO_SHARD_WIDTH ids, not `id % n`: neighbouring ids
 * are near-identical types (a module's variants, a ship's skins) sharing most
 * of their text, so gzip compresses them together — ~1.3 MB over the set,
 * against ~2.9 MB scattered by modulo. A patch that only adds new types
 * usually rewrites just the top bucket, so the rest keep their `?v=` hash.
 * Opening one item parses one small file rather than the whole ~12 MB set.
 *
 * 64 buckets cover ids below 128,000 (the highest published id is ~98,000).
 * The build fails on a published id past that; raise the count here and in
 * `scripts/lib/typeInfo.mjs` together.
 */
export const TYPE_INFO_SHARD_WIDTH = 2000;
export const TYPE_INFO_SHARD_COUNT = 64;

/** One published type's baked Item Detail data, as ESI's `/universe/types/{id}` would give it. */
export interface TypeInfoRecord {
  /** English description, newlines as ESI sends them. */
  description: string;
  /** `[attributeId, value]` pairs: ESI's `dogma_attributes`, including the type-row ones (4, 38, 161, 162). */
  attributes: [number, number][];
  volume?: number;
}

/** One shard file: type id (as a string key) -> record. */
export type TypeInfoShard = Record<string, TypeInfoRecord>;

/** The type's bucket, or null when it falls outside every bucket (none baked). */
export function typeInfoShard(typeId: number): number | null {
  const shard = Math.floor(typeId / TYPE_INFO_SHARD_WIDTH);
  return shard >= 0 && shard < TYPE_INFO_SHARD_COUNT ? shard : null;
}

/** The shard's path under `public/data/`, as `sdeDataUrl` takes it; null as {@link typeInfoShard}. */
export function typeInfoShardFile(typeId: number): string | null {
  const shard = typeInfoShard(typeId);
  return shard === null ? null : `typeInfo/${shard}.json`;
}
