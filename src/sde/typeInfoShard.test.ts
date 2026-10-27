import { describe, expect, it } from 'vitest';
import {
  TYPE_INFO_SHARD_COUNT,
  TYPE_INFO_SHARD_WIDTH,
  typeInfoBucket,
  typeInfoShardFile,
} from './typeInfoShard';

describe('typeInfoBucket', () => {
  it('buckets type ids by range, a fixed number of fixed-width buckets', () => {
    expect(TYPE_INFO_SHARD_WIDTH).toBe(2000);
    expect(TYPE_INFO_SHARD_COUNT).toBe(64);
    expect(typeInfoBucket(0)).toBe(0);
    expect(typeInfoBucket(587)).toBe(0);
    expect(typeInfoBucket(1999)).toBe(0);
    expect(typeInfoBucket(2000)).toBe(1);
    expect(typeInfoBucket(97_897)).toBe(48);
    expect(typeInfoBucket(127_999)).toBe(63);
  });

  it('has no bucket for an id past the last one, or a negative id', () => {
    expect(typeInfoBucket(128_000)).toBeNull();
    expect(typeInfoBucket(-1)).toBeNull();
  });

  it('names the shard file under data/typeInfo/, null when there is no bucket', () => {
    expect(typeInfoShardFile(587)).toBe('typeInfo/0.json');
    expect(typeInfoShardFile(2873)).toBe('typeInfo/1.json');
    expect(typeInfoShardFile(128_000)).toBeNull();
  });
});
