import { describe, it, expect } from 'vitest';
import { parseVitestReports } from './unitShards.mjs';

const file = (name, startTime, endTime) => ({ name, startTime, endTime });

describe('parseVitestReports', () => {
  it('reports seconds per repo-relative path, sorted by name', () => {
    const weights = parseVitestReports([
      {
        testResults: [
          file('/home/runner/work/r/r/src/b.test.ts', 1000, 3500),
          file('/home/runner/work/r/r/scripts/lib/a.test.mjs', 0, 400),
        ],
      },
    ]);
    expect(weights).toEqual({ 'scripts/lib/a.test.mjs': 0.4, 'src/b.test.ts': 2.5 });
    expect(Object.keys(weights)).toEqual(['scripts/lib/a.test.mjs', 'src/b.test.ts']);
  });

  it('merges shards and normalises Windows separators', () => {
    const weights = parseVitestReports([
      { testResults: [file('C:\\repo\\src\\a.test.ts', 0, 1000)] },
      {
        testResults: [
          file('C:\\repo\\src\\a.test.ts', 0, 500),
          file('C:\\repo\\scripts\\lib\\b.test.mjs', 0, 250),
        ],
      },
    ]);
    expect(weights).toEqual({ 'scripts/lib/b.test.mjs': 0.25, 'src/a.test.ts': 1.5 });
  });

  it('finds the repo root even when the checkout sits under a src/ directory', () => {
    const weights = parseVitestReports([
      {
        testResults: [
          file('/home/x/src/neocom-desk/src/a.test.ts', 0, 1000),
          file('/home/x/src/neocom-desk/scripts/lib/b.test.mjs', 0, 1000),
        ],
      },
    ]);
    expect(Object.keys(weights)).toEqual(['scripts/lib/b.test.mjs', 'src/a.test.ts']);
  });

  it('refuses reports it cannot root, rather than writing wrong keys', () => {
    const lone = [{ testResults: [file('/r/other/x.test.ts', 0, 10)] }];
    expect(() => parseVitestReports(lone)).toThrow(/cannot find the repo root/);
  });
});
