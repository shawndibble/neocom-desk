#!/usr/bin/env node
/**
 * Refreshes src/test/shard-weights.json from the Vitest JSON reports the CI
 * `test-shard` jobs can emit:
 *   node scripts/unit-shard-weights.mjs report1.json report2.json ...
 * Add `--reporter=json --outputFile.json=vitest-report.json` to a shard's
 * `test:run` step (and upload the file) to produce them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseVitestReports } from './lib/unitShards.mjs';

const WEIGHTS_PATH = 'src/test/shard-weights.json';
const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('usage: unit-shard-weights.mjs <vitest-json-report>...');
  process.exit(2);
}
const weights = parseVitestReports(paths.map((p) => JSON.parse(readFileSync(p, 'utf8'))));
// A report with no files must not overwrite the table with `{}`.
if (Object.keys(weights).length === 0) {
  console.error('no test files found in those reports');
  process.exit(1);
}
writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2) + '\n');
console.error(`wrote ${Object.keys(weights).length} weights to ${WEIGHTS_PATH}`);
