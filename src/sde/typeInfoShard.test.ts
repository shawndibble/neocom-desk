import { describe, expect, it } from 'vitest';
import {
  TYPE_INFO_SHARD_COUNT,
  TYPE_INFO_SHARD_WIDTH,
  typeInfoShard,
  typeInfoShardFile,
} from './typeInfoShard';

describe('typeInfoShard', () => {
  it('buckets type ids by range, a fixed number of fixed-width buckets', () => {
    expect(TYPE_INFO_SHARD_WIDTH).toBe(2000);
    expect(TYPE_INFO_SHARD_COUNT).toBe(64);
    expect(typeInfoShard(0)).toBe(0);
    expect(typeInfoShard(587)).toBe(0);
    expect(typeInfoShard(1999)).toBe(0);
    expect(typeInfoShard(2000)).toBe(1);
    expect(typeInfoShard(97_897)).toBe(48);
    expect(typeInfoShard(127_999)).toBe(63);
  });

  it('has no bucket for an id past the last one, or a negative id', () => {
    expect(typeInfoShard(128_000)).toBeNull();
    expect(typeInfoShard(-1)).toBeNull();
  });

  it('names the shard file under data/typeInfo/, null when there is no bucket', () => {
    expect(typeInfoShardFile(587)).toBe('typeInfo/0.json');
    expect(typeInfoShardFile(2873)).toBe('typeInfo/1.json');
    expect(typeInfoShardFile(128_000)).toBeNull();
  });
});
