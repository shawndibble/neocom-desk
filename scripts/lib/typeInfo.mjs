// typeInfo/<n>.json: every published type's Item Detail data — description,
// dogma attributes and volume — so Show info opens offline (issue #3882).
// Shaped as ESI's `/universe/types/{id}` gives it, from CCP's JSONL export:
// Fuzzwork's CSV `valueFloat` rounds (Rifter attr 124: 16777200, not 16777215).

// Same as src/sde/typeInfoShard.ts, which the app reads shards by (and says
// why range buckets); src/sde/typeInfoShards.test.ts checks the committed files.
export const TYPE_INFO_SHARD_WIDTH = 2000;
export const TYPE_INFO_SHARD_COUNT = 64;

// The attributes ESI adds to `dogma_attributes` from the type row itself,
// with the value it sends when the row has none (verified live: EMP S, 185,
// has no capacity or radius and gets 38 = 0, 162 = 1).
const TYPE_ROW_ATTRIBUTES = [
  [4, 'mass', 0],
  [38, 'capacity', 0],
  [161, 'volume', 0],
  [162, 'radius', 1],
];

/**
 * TYPE_INFO_SHARD_COUNT shard objects (index = floor(typeId / width)), each
 * type id -> `{ description, attributes: [[attributeId, value], ...], volume? }`,
 * published types only; an empty bucket is `{}`, so every file the app lists
 * exists. `types`/`typeDogma` are parsed `types.jsonl`/`typeDogma.jsonl` records.
 */
export function bakeTypeInfoShards(types, typeDogma) {
  const dogmaByType = new Map(typeDogma.map((r) => [r._key, r.dogmaAttributes ?? []]));
  const shards = Array.from({ length: TYPE_INFO_SHARD_COUNT }, () => ({}));
  const published = types.filter((t) => t.published).sort((a, b) => a._key - b._key);
  for (const t of published) {
    const shard = Math.floor(t._key / TYPE_INFO_SHARD_WIDTH);
    if (shard >= TYPE_INFO_SHARD_COUNT) {
      throw new Error(
        `Published type ${t._key} is past the last typeInfo bucket (ids < ${TYPE_INFO_SHARD_COUNT * TYPE_INFO_SHARD_WIDTH}): raise TYPE_INFO_SHARD_COUNT in both scripts/lib/typeInfo.mjs and src/sde/typeInfoShard.ts`
      );
    }
    const dogma = dogmaByType.get(t._key);
    // ESI sends no `dogma_attributes` at all for a type without a dogma row
    // (Tritanium), type-row ones included.
    const attributes = [];
    if (dogma) {
      const byId = new Map(dogma.map((a) => [a.attributeID, a.value]));
      for (const [id, field, fallback] of TYPE_ROW_ATTRIBUTES) byId.set(id, t[field] ?? fallback);
      attributes.push(...[...byId].sort((a, b) => a[0] - b[0]));
    }
    // CCP's export uses `\n`; ESI, which EveMarkupText was built against, `\r\n`.
    const record = {
      description: (t.description?.en ?? '').replace(/\r?\n/g, '\r\n'),
      attributes,
    };
    if (t.volume !== undefined) record.volume = t.volume;
    shards[shard][t._key] = record;
  }
  return shards;
}
