/**
 * Splits e2e spec files into shards of roughly equal run time.
 *
 * Playwright's own `--shard` cuts the sorted test list into contiguous runs,
 * so every test of a big parametrized sweep (`coreOnlyCharacterSweep` is ~100
 * tests) lands in one shard and that shard sets the job's wall time. This
 * deals whole files out by measured weight instead: heaviest first, each to
 * the lightest shard so far (longest-processing-time-first).
 */

/** The weight of a file with no measurement: the median, so a new spec is neither free nor huge. */
function medianWeight(weights) {
  const values = Object.values(weights).sort((a, b) => a - b);
  if (values.length === 0) return 1;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * @param {string[]} files   every spec file, e.g. `e2e/foo.spec.ts`
 * @param {Record<string, number>} weights  seconds of worker time per file
 * @param {number} shardCount
 * @returns {string[][]} one sorted file list per shard, index 0 = shard 1
 */
export function partitionByWeight(files, weights, shardCount) {
  const fallback = medianWeight(weights);
  const weighted = files
    .map((file) => ({ file, weight: weights[file] ?? fallback }))
    .sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file));

  const shards = Array.from({ length: shardCount }, () => ({ load: 0, files: [] }));
  for (const { file, weight } of weighted) {
    let lightest = shards[0];
    for (const shard of shards) if (shard.load < lightest.load) lightest = shard;
    lightest.files.push(file);
    lightest.load += weight;
  }
  return shards.map((shard) => shard.files.sort());
}

/**
 * Sums per-file seconds out of a Playwright list-reporter log. Lines look like
 *   `  ✓    1 [chromium] › e2e/foo.spec.ts:10:3 › title (3.6s)`
 * with `ms`, `s` or `m` units, and a trailing `(retry #1)` on a retried
 * attempt (counted: it is real worker time).
 * @param {string} log
 * @returns {Record<string, number>} whole seconds per file, sorted by name
 */
export function parseListReporterLog(log) {
  const text = log.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  const unit = { ms: 0.001, s: 1, m: 60 };
  const weights = {};
  for (const m of text.matchAll(
    /[✓✘] +\d+ \[\w+\] › (e2e\/[^:]+):\S+ › .* \(([\d.]+)(ms|s|m)\)(?: \(retry #\d+\))?$/gm
  )) {
    weights[m[1]] = (weights[m[1]] ?? 0) + Number(m[2]) * unit[m[3]];
  }
  return Object.fromEntries(
    Object.entries(weights)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, seconds]) => [file, Math.round(seconds)])
  );
}
