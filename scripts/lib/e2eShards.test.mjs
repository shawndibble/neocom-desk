import { describe, it, expect } from 'vitest';
import { parseListReporterLog, partitionByWeight } from './e2eShards.mjs';

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

describe('parseListReporterLog', () => {
  it('sums seconds per file across tests, in ms, s and m units', () => {
    const log = [
      '2026-10-19T20:01:54Z   ✓    1 [chromium] › e2e/a.spec.ts:10:3 › one (3.6s)',
      '2026-10-19T20:01:55Z   ✓    2 [built] › e2e/a.spec.ts:20:3 › two (400ms)',
      '2026-10-19T20:01:56Z   ✘    3 [dev] › e2e/b.spec.ts:5:1 › slow (1.5m)',
    ].join('\n');
    expect(parseListReporterLog(log)).toEqual({ 'e2e/a.spec.ts': 4, 'e2e/b.spec.ts': 90 });
  });

  it('counts retry attempts and tolerates CRLF and colour codes', () => {
    const log =
      '  \x1b[31m✘\x1b[39m    1 [dev] › e2e/a.spec.ts:1:1 › t (retry #1) (2.0s)\r\n' +
      '  ✘    2 [dev] › e2e/a.spec.ts:1:1 › t (2.0s) (retry #1)\r\n';
    expect(parseListReporterLog(log)).toEqual({ 'e2e/a.spec.ts': 4 });
  });

  it('returns nothing for a log with no test lines', () => {
    expect(parseListReporterLog('npm ci\nadded 1044 packages')).toEqual({});
  });
});
