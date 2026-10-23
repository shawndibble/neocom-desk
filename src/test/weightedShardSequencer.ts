import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { partitionByWeight } from '../../scripts/lib/e2eShards.mjs';

/**
 * Vitest's own `--shard` sorts files by a hash of their path and cuts the list
 * into equal-COUNT slices, so it balances the number of files and not their
 * cost: one shard drew the heavy route tests and ran 360-396s while another
 * finished in 220s, and the job is as slow as its slowest shard. This deals
 * whole files out by measured weight instead, the same way `e2e-shard.mjs`
 * does for Playwright, so `--shard=N/M` keeps working unchanged.
 *
 * Weights live in `shard-weights.json` (seconds of file time, keyed by path
 * relative to the repo root). A file missing from it counts as the median, so
 * a new test needs no edit to run; refresh the table with
 * `node scripts/unit-shard-weights.mjs <vitest-json-report>...`.
 */
const WEIGHTS_PATH = new URL('./shard-weights.json', import.meta.url);

export default class WeightedShardSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (!shard) return files;

    const weights = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf-8')) as Record<string, number>;
    const byPath = new Map(
      files.map((spec) => [relative(root, spec.moduleId).split(sep).join('/'), spec])
    );
    const mine = partitionByWeight([...byPath.keys()], weights, shard.count)[shard.index - 1];
    return mine.map((path) => byPath.get(path)!);
  }
}
