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
      { testResults: [file('/home/x/src/a.test.ts', 0, 500)] },
    ]);
    expect(weights).toEqual({ 'src/a.test.ts': 1.5 });
  });

  it('skips files outside src/ and scripts/', () => {
    expect(parseVitestReports([{ testResults: [file('/r/other/x.test.ts', 0, 10)] }])).toEqual({});
  });
});
