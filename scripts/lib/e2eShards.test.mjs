import { describe, it, expect } from 'vitest';
import { partitionByWeight } from './e2eShards.mjs';

describe('partitionByWeight', () => {
  it('puts every file in exactly one shard', () => {
    const files = ['e2e/a.spec.ts', 'e2e/b.spec.ts', 'e2e/c.spec.ts', 'e2e/d.spec.ts'];
    const shards = partitionByWeight(files, { 'e2e/a.spec.ts': 5, 'e2e/b.spec.ts': 1 }, 3);
    expect(shards.flat().sort()).toEqual(files);
  });

  it('keeps the heavy files apart instead of chunking them together', () => {
    const weights = {
      'e2e/a.spec.ts': 100,
      'e2e/b.spec.ts': 100,
      'e2e/c.spec.ts': 1,
      'e2e/d.spec.ts': 1,
    };
    const shards = partitionByWeight(Object.keys(weights), weights, 2);
    expect(shards).toEqual([
      ['e2e/a.spec.ts', 'e2e/c.spec.ts'],
      ['e2e/b.spec.ts', 'e2e/d.spec.ts'],
    ]);
  });

  it('gives a file with no measurement the median weight, not zero', () => {
    // Unmeasured files weigh 10 (the only measurement), so the second one
    // goes back to the first shard; at weight 0 both would pile onto shard 2.
    const shards = partitionByWeight(
      ['e2e/a.spec.ts', 'e2e/n1.spec.ts', 'e2e/n2.spec.ts'],
      { 'e2e/a.spec.ts': 10 },
      2
    );
    expect(shards).toEqual([['e2e/a.spec.ts', 'e2e/n2.spec.ts'], ['e2e/n1.spec.ts']]);
  });

  it('is deterministic, so every shard job computes the same split', () => {
    const files = ['e2e/z.spec.ts', 'e2e/y.spec.ts', 'e2e/x.spec.ts'];
    expect(partitionByWeight(files, {}, 2)).toEqual(partitionByWeight([...files].reverse(), {}, 2));
  });

  it('returns empty shards when there are more shards than files', () => {
    expect(partitionByWeight(['e2e/a.spec.ts'], {}, 3)).toEqual([['e2e/a.spec.ts'], [], []]);
  });
});
