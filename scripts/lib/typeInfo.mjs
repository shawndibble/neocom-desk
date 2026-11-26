export const TYPE_INFO_SHARD_WIDTH = 2000;
export const TYPE_INFO_SHARD_COUNT = 64;

export function typeInfoBucketOf(typeId) {
  return Math.floor(typeId / TYPE_INFO_SHARD_WIDTH);
}

const TYPE_ROW_ATTRIBUTES = [
  [4, 'mass', 0],
  [38, 'capacity', 0],
  [161, 'volume', 0],
  [162, 'radius', 1],
];

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
    const attributes = [];
    if (dogma) {
      const byId = new Map((dogma.dogmaAttributes ?? []).map((a) => [a.attributeID, a.value]));
      for (const [id, field, fallback] of TYPE_ROW_ATTRIBUTES) byId.set(id, t[field] ?? fallback);
      attributes.push(...[...byId].sort((a, b) => a[0] - b[0]));
    }
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
