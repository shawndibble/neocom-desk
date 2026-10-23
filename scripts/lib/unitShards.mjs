/**
 * Sums per-file seconds out of Vitest JSON reports (`--reporter=json`), one
 * report per CI shard. A file's time is its `endTime - startTime`, which
 * includes the import, environment and setup cost that dominates this suite.
 * @param {{ testResults: { name: string, startTime: number, endTime: number }[] }[]} reports
 * @returns {Record<string, number>} seconds (2 decimals) per repo-relative path, sorted by name
 */
export function parseVitestReports(reports) {
  const weights = {};
  for (const report of reports) {
    for (const { name, startTime, endTime } of report.testResults) {
      // Absolute path on whatever machine ran it; the repo root is whatever
      // precedes the first `src/` or `scripts/` directory.
      const match = /^.*?[\\/]((?:src|scripts)[\\/].*)$/.exec(name);
      if (!match) continue;
      const path = match[1].replaceAll('\\', '/');
      weights[path] = (weights[path] ?? 0) + (endTime - startTime) / 1000;
    }
  }
  return Object.fromEntries(
    Object.entries(weights)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, seconds]) => [file, Math.round(seconds * 100) / 100])
  );
}
