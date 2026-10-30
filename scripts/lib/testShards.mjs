/**
 * Helpers for `scripts/test-shard.mjs`, which deals the unit test files out to
 * CI shards by measured run time (see `e2eShards.mjs` for the dealing itself).
 *
 * Vitest's own `--shard` splits by a hash of the file path, which ignores run
 * time: with four shards the slowest took 481s and the fastest 266s.
 */

/** The files the Vitest `unit` and `dom` projects in `vite.config.ts` include. */
const TEST_FILE =
  /^(?:src\/.+\.(?:test|spec)\.tsx?|scripts\/lib\/.+\.test\.mjs|workers\/.+\.test\.mjs)$/;

/** @param {string} file repo-relative path */
export const isUnitTestFile = (file) => TEST_FILE.test(file);

/**
 * Whole seconds of wall time per test file, from Vitest `--reporter=json`
 * reports (the `vitest-timing-shard-N` CI artifacts). A file in several reports
 * gets the mean, which smooths the swing between runs.
 * @param {{ testResults: { name: string, startTime: number, endTime: number }[] }[]} reports
 * @returns {Record<string, number>} sorted by path
 */
export function weightsFromVitestReports(reports) {
  const seconds = new Map();
  for (const report of reports) {
    for (const suite of report.testResults) {
      const file = suite.name.replace(/^.*?\/neocom-desk\/(?=(?:src|scripts|workers)\/)/, '');
      const list = seconds.get(file) ?? [];
      list.push((suite.endTime - suite.startTime) / 1000);
      seconds.set(file, list);
    }
  }
  return Object.fromEntries(
    [...seconds]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, list]) => [
        file,
        Math.max(1, Math.round(list.reduce((sum, value) => sum + value, 0) / list.length)),
      ])
  );
}
