function medianWeight(weights) {
  const values = Object.values(weights).sort((a, b) => a - b);
  if (values.length === 0) return 1;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export function totalWeight(files, weights) {
  const fallback = medianWeight(weights);
  return files.reduce((sum, file) => sum + (weights[file] ?? fallback), 0);
}

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
