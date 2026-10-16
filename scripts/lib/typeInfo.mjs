// typeInfo/<n>.json: every published type's description, dogma attributes and
// effects, volume and packaged volume, shaped as ESI's /universe/types/{id}
// (issues #3882, #3884). Source is CCP
// JSONL, not Fuzzwork CSV: its valueFloat rounds (Rifter attr 124: 16777200,
// not 16777215).

// Same as src/sde/typeInfoShard.ts, which the app reads shards by (and says
// why range buckets); src/sde/typeInfoShards.test.ts checks the committed files.
export const TYPE_INFO_SHARD_WIDTH = 2000;
export const TYPE_INFO_SHARD_COUNT = 64;

/** The shard index a type id falls in; may be past the last shard. */
export function typeInfoBucketOf(typeId) {
  return Math.floor(typeId / TYPE_INFO_SHARD_WIDTH);
}

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
 * TYPE_INFO_SHARD_COUNT shards, each type id -> `{ description, attributes:
 * [[id, value]...], effects: [id...], defaultEffect?, volume?, packagedVolume? }`,
 * published only; packagedVolume only where it differs from volume (the app
 * reads `packaged ?? volume`, as ESI's own). An empty bucket is `{}` so
 * every listed file exists. `types`/`typeDogma` are parsed
 * `types.jsonl`/`typeDogma.jsonl` records.
 */
export function bakeTypeInfoShards(types, typeDogma) {
  const dogmaByType = new Map(typeDogma.map((r) => [r._key, r]));
  const shards = Array.from({ length: TYPE_INFO_SHARD_COUNT }, () => ({}));
  const published = types.filter((t) => t.published).sort((a, b) => a._key - b._key);
  for (const t of published) {
    const shard = typeInfoBucketOf(t._key);
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
      const byId = new Map((dogma.dogmaAttributes ?? []).map((a) => [a.attributeID, a.value]));
      for (const [id, field, fallback] of TYPE_ROW_ATTRIBUTES) byId.set(id, t[field] ?? fallback);
      attributes.push(...[...byId].sort((a, b) => a[0] - b[0]));
    }
    // CCP's export uses `\n`; ESI, which EveMarkupText was built against, `\r\n`.
    const effects = dogma?.dogmaEffects ?? [];
    const record = {
      description: (t.description?.en ?? '').replace(/\r?\n/g, '\r\n'),
      attributes,
      effects: effects.map((e) => e.effectID).sort((a, b) => a - b),
    };
    const defaultEffect = effects.find((e) => e.isDefault)?.effectID;
    if (defaultEffect !== undefined) record.defaultEffect = defaultEffect;
    if (t.volume !== undefined) record.volume = t.volume;
    if (t.packagedVolume !== undefined && t.packagedVolume !== t.volume) {
      record.packagedVolume = t.packagedVolume;
    }
    shards[shard][t._key] = record;
  }
  return shards;
}
