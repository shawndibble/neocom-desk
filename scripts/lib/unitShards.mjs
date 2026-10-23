/**
 * Sums per-file seconds out of Vitest JSON reports (`--reporter=json`), one
 * report per CI shard. A file's time is its `endTime - startTime`, which
 * includes the import, environment and setup cost that dominates this suite.
 * @param {{ testResults: { name: string, startTime: number, endTime: number }[] }[]} reports
 * @returns {Record<string, number>} seconds (2 decimals) per repo-relative path, sorted by name
 * @throws if the repo root cannot be told from the paths (reports from a lone subtree)
 */
export function parseVitestReports(reports) {
  const results = reports
    .flatMap((report) => report.testResults)
    .map(({ name, startTime, endTime }) => ({
      path: name.replaceAll('\\', '/'),
      seconds: (endTime - startTime) / 1000,
    }));
  // The reports hold absolute paths from whatever machine ran them. Every test
  // lives under the repo root, so the longest directory prefix they all share
  // is that root (or deeper, if every file sits in one subtree: guarded below).
  const root = commonDirectory(results.map((r) => r.path));
  const weights = {};
  for (const { path, seconds } of results) {
    const key = path.slice(root.length);
    weights[key] = (weights[key] ?? 0) + seconds;
  }
  const stray = Object.keys(weights).find((key) => !/^(src|scripts)\//.test(key));
  if (stray) {
    throw new Error(
      `cannot find the repo root from these reports; "${stray}" is not under src/ or scripts/`
    );
  }
  return Object.fromEntries(
    Object.entries(weights)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, seconds]) => [file, Math.round(seconds * 100) / 100])
  );
}

/** The longest shared directory prefix of `/`-separated paths, ending in `/`. */
function commonDirectory(paths) {
  if (paths.length === 0) return '';
  const split = paths.map((p) => p.split('/').slice(0, -1));
  const first = split[0];
  let depth = 0;
  while (depth < first.length && split.every((parts) => parts[depth] === first[depth])) depth++;
  return first
    .slice(0, depth)
    .map((part) => part + '/')
    .join('');
}
