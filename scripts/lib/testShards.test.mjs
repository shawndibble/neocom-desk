import { describe, it, expect } from 'vitest';
import { isUnitTestFile, weightsFromVitestReports } from './testShards.mjs';

describe('isUnitTestFile', () => {
  it('matches the files the Vitest projects include', () => {
    expect(isUnitTestFile('src/routes/Mail.test.tsx')).toBe(true);
    expect(isUnitTestFile('src/lib/chunk.test.ts')).toBe(true);
    expect(isUnitTestFile('src/lib/chunk.spec.ts')).toBe(true);
    expect(isUnitTestFile('scripts/lib/blockedBy.test.mjs')).toBe(true);
    expect(isUnitTestFile('workers/foo/bar.test.mjs')).toBe(true);
  });

  it('leaves out files no Vitest project runs', () => {
    expect(isUnitTestFile('e2e/foo.spec.ts')).toBe(false);
    expect(isUnitTestFile('functions/src/index.test.ts')).toBe(false);
    expect(isUnitTestFile('scripts/build-sde.mjs')).toBe(false);
    expect(isUnitTestFile('src/routes/Mail.tsx')).toBe(false);
  });
});

describe('weightsFromVitestReports', () => {
  const report = (...suites) => ({
    testResults: suites.map(([name, start, end]) => ({ name, startTime: start, endTime: end })),
  });

  it('turns each file wall time into whole seconds under a repo-relative path', () => {
    const weights = weightsFromVitestReports([
      report(['/home/runner/work/neocom-desk/neocom-desk/src/routes/Mail.test.tsx', 0, 12_400]),
    ]);
    expect(weights).toEqual({ 'src/routes/Mail.test.tsx': 12 });
  });

  it('never weighs a file at zero', () => {
    const weights = weightsFromVitestReports([report(['/x/neocom-desk/src/a.test.ts', 0, 40])]);
    expect(weights['src/a.test.ts']).toBe(1);
  });

  it('averages a file that appears in several reports', () => {
    const weights = weightsFromVitestReports([
      report(['/x/neocom-desk/src/a.test.ts', 0, 10_000]),
      report(['/x/neocom-desk/src/a.test.ts', 0, 20_000]),
    ]);
    expect(weights['src/a.test.ts']).toBe(15);
  });
});
