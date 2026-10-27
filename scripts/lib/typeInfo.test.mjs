import { describe, it, expect } from 'vitest';
import {
  bakeTypeInfoShards,
  typeInfoBucketOf,
  TYPE_INFO_SHARD_COUNT,
  TYPE_INFO_SHARD_WIDTH,
} from './typeInfo.mjs';

const bucket = (id) => Math.floor(id / 2000);

const rifter = {
  _key: 587,
  published: true,
  description: { en: 'A frigate.\n\nFast.', de: 'Eine Fregatte.' },
  mass: 1067000,
  capacity: 140,
  volume: 27289,
  radius: 31,
};
const rifterDogma = {
  _key: 587,
  dogmaAttributes: [
    { attributeID: 124, value: 16777215 },
    { attributeID: 9, value: 350 },
    { attributeID: 153, value: 0.00000224 },
    { attributeID: 5796, value: 2147483647000 },
  ],
};

describe('typeInfoBucketOf', () => {
  it('floors the id by the shard width, including past the last shard', () => {
    expect(typeInfoBucketOf(0)).toBe(0);
    expect(typeInfoBucketOf(587)).toBe(0);
    expect(typeInfoBucketOf(1999)).toBe(0);
    expect(typeInfoBucketOf(2000)).toBe(1);
    expect(typeInfoBucketOf(97_897)).toBe(48);
    expect(typeInfoBucketOf(TYPE_INFO_SHARD_COUNT * TYPE_INFO_SHARD_WIDTH)).toBe(
      TYPE_INFO_SHARD_COUNT
    );
  });
});

describe('bakeTypeInfoShards', () => {
  it('returns every bucket, each type in bucket floor(typeId / width), empty ones as {}', () => {
    const shards = bakeTypeInfoShards(
      [rifter, { _key: 620, published: true }, { _key: 97_897, published: true }],
      [rifterDogma]
    );
    expect(TYPE_INFO_SHARD_WIDTH).toBe(2000);
    expect(TYPE_INFO_SHARD_COUNT).toBe(64);
    expect(shards).toHaveLength(64);
    expect(Object.keys(shards[0])).toEqual(['587', '620']);
    expect(Object.keys(shards[48])).toEqual(['97897']);
    expect(shards.filter((s) => Object.keys(s).length > 0)).toHaveLength(2);
    expect(shards[63]).toEqual({});
  });

  it('fails on a published type past the last bucket, naming the count to raise', () => {
    expect(() => bakeTypeInfoShards([{ _key: 128_000, published: true }], [])).toThrow(
      /TYPE_INFO_SHARD_COUNT/
    );
    // An unpublished one is never baked, so it doesn't need a bucket.
    expect(() => bakeTypeInfoShards([{ _key: 128_000, published: false }], [])).not.toThrow();
  });

  it('skips unpublished types', () => {
    const shards = bakeTypeInfoShards([{ ...rifter, published: false }], [rifterDogma]);
    expect(shards.every((s) => Object.keys(s).length === 0)).toBe(true);
  });

  it('merges the type-row attributes into the dogma ones, sorted by id, at full precision', () => {
    const [record] = Object.values(bakeTypeInfoShards([rifter], [rifterDogma])[bucket(587)]);
    expect(record.attributes).toEqual([
      [4, 1067000],
      [9, 350],
      [38, 140],
      [124, 16777215],
      [153, 0.00000224],
      [161, 27289],
      [162, 31],
      [5796, 2147483647000],
    ]);
  });

  it('gives the type-row attributes ESI defaults when the row lacks them (radius 1, else 0)', () => {
    const ammo = { _key: 185, published: true, mass: 0.01, volume: 0.0025 };
    const dogma = { _key: 185, dogmaAttributes: [{ attributeID: 128, value: 1 }] };
    const record = bakeTypeInfoShards([ammo], [dogma])[bucket(185)]['185'];
    expect(record.attributes).toEqual([
      [4, 0.01],
      [38, 0],
      [128, 1],
      [161, 0.0025],
      [162, 1],
    ]);
  });

  it('has no attributes at all for a type with no dogma row, as ESI omits them', () => {
    const tritanium = { _key: 34, published: true, volume: 0.01 };
    expect(bakeTypeInfoShards([tritanium], [])[bucket(34)]['34'].attributes).toEqual([]);
  });

  it("keeps the English description with ESI's \\r\\n newlines, empty when there is none", () => {
    const shards = bakeTypeInfoShards([rifter, { _key: 25, published: true }], [rifterDogma]);
    expect(shards[bucket(587)]['587'].description).toBe('A frigate.\r\n\r\nFast.');
    expect(shards[bucket(25)]['25'].description).toBe('');
  });

  it('carries volume from the type row only when it has one', () => {
    const shards = bakeTypeInfoShards(
      [rifter, { _key: 2256, published: true, capacity: 10000 }],
      []
    );
    expect(shards[bucket(587)]['587'].volume).toBe(27289);
    expect(shards[bucket(2256)]['2256']).not.toHaveProperty('volume');
  });

  it('carries effect ids sorted, and the default one apart; [] for no dogma row', () => {
    const dogma = {
      ...rifterDogma,
      dogmaEffects: [
        { effectID: 42, isDefault: false },
        { effectID: 12, isDefault: true },
        { effectID: 16, isDefault: false },
      ],
    };
    const shards = bakeTypeInfoShards([rifter, { _key: 34, published: true }], [dogma]);
    expect(shards[bucket(587)]['587'].effects).toEqual([12, 16, 42]);
    expect(shards[bucket(587)]['587'].defaultEffect).toBe(12);
    expect(shards[bucket(34)]['34'].effects).toEqual([]);
    expect(shards[bucket(34)]['34']).not.toHaveProperty('defaultEffect');
  });

  it('carries packaged volume only where it differs from volume', () => {
    const merlin = { _key: 603, published: true, volume: 16500, packagedVolume: 2500 };
    const tritanium = { _key: 34, published: true, volume: 0.01, packagedVolume: 0.01 };
    const shards = bakeTypeInfoShards([merlin, tritanium], []);
    expect(shards[bucket(603)]['603'].packagedVolume).toBe(2500);
    expect(shards[bucket(34)]['34']).not.toHaveProperty('packagedVolume');
  });

  it('writes keys in ascending type id order', () => {
    const shards = bakeTypeInfoShards(
      [
        { _key: 1500, published: true },
        { _key: 32, published: true },
        { _key: 640, published: true },
      ],
      []
    );
    expect(Object.keys(shards[0])).toEqual(['32', '640', '1500']);
  });
});
