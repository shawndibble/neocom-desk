/**
 * Which `public/data/typeInfo/<n>.json` shard holds a type's baked Item Detail
 * data (description + dogma attributes, issue #3882). Shared contract with
 * `scripts/lib/typeInfo.mjs`, which writes the shards with the same key —
 * `typeInfoShards.test.ts` checks the two agree against the committed files.
 *
 * 32 shards keep each one ~300 KB raw, so opening one item parses a small
 * file rather than the whole ~10 MB set.
 */
export const TYPE_INFO_SHARD_COUNT = 32;

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

export function typeInfoShard(typeId: number): number {
  return typeId % TYPE_INFO_SHARD_COUNT;
}

/** The shard's path under `public/data/`, as `sdeDataUrl` takes it. */
export function typeInfoShardFile(typeId: number): string {
  return `typeInfo/${typeInfoShard(typeId)}.json`;
}
