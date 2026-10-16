import { describe, expect, it } from 'vitest';
import { TYPE_INFO_SHARD_COUNT, typeInfoShard, typeInfoShardFile } from './typeInfoShard';

describe('typeInfoShard', () => {
  it('spreads type ids across a fixed number of shards', () => {
    expect(TYPE_INFO_SHARD_COUNT).toBe(32);
    expect(typeInfoShard(0)).toBe(0);
    expect(typeInfoShard(31)).toBe(31);
    expect(typeInfoShard(32)).toBe(0);
    expect(typeInfoShard(587)).toBe(587 % 32);
  });

  it('names the shard file under data/typeInfo/', () => {
    expect(typeInfoShardFile(587)).toBe(`typeInfo/${587 % 32}.json`);
  });
});
