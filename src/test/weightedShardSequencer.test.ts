import { describe, it, expect, vi } from 'vitest';
import type { TestSpecification } from 'vitest/node';
import WeightedShardSequencer from './weightedShardSequencer.ts';

vi.mock('node:fs', () => ({
  readFileSync: () => JSON.stringify({ 'src/heavy1.test.ts': 100, 'src/heavy2.test.ts': 100 }),
}));

const spec = (path: string) => ({ moduleId: `/repo/${path}` }) as TestSpecification;
const specs = ['heavy1', 'heavy2', 'light1', 'light2'].map((n) => spec(`src/${n}.test.ts`));

function shardOf(index: number, count: number, files = specs) {
  const ctx = { config: { root: '/repo', shard: { index, count } } };
  // The sequencer only reads `ctx.config`; a full Vitest instance is not needed.
  return new WeightedShardSequencer(ctx as never).shard(files);
}

describe('WeightedShardSequencer', () => {
  it('keeps the heavy files in different shards', async () => {
    const [a, b] = await Promise.all([shardOf(1, 2), shardOf(2, 2)]);
    const names = (s: TestSpecification[]) => s.map((x) => x.moduleId).sort();
    expect(names(a).filter((n) => n.includes('heavy'))).toHaveLength(1);
    expect(names(b).filter((n) => n.includes('heavy'))).toHaveLength(1);
  });

  it('runs every file exactly once across the shards', async () => {
    const all = (await Promise.all([1, 2, 3].map((i) => shardOf(i, 3)))).flat();
    expect(all.map((s) => s.moduleId).sort()).toEqual(specs.map((s) => s.moduleId).sort());
  });

  it('does nothing without --shard', async () => {
    const ctx = { config: { root: '/repo', shard: undefined } };
    expect(await new WeightedShardSequencer(ctx as never).shard(specs)).toBe(specs);
  });
});
