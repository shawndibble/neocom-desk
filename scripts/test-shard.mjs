#!/usr/bin/env node
/**
 * Prints the unit test files one CI shard should run, one per line:
 *   node scripts/test-shard.mjs --shard 3/4
 *
 * Weights live in scripts/test-shard-weights.json (seconds of wall time per
 * file). Refresh them from the `vitest-timing-shard-N` CI artifacts with
 *   node scripts/test-shard.mjs --weights vitest-timing-1.json vitest-timing-2.json ...
 * A file missing from the table is treated as median, so a new test file needs
 * no edit here to be run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { partitionByWeight } from './lib/e2eShards.mjs';
import { isUnitTestFile, weightsFromVitestReports } from './lib/testShards.mjs';

const WEIGHTS_PATH = 'scripts/test-shard-weights.json';
const args = process.argv.slice(2);

if (args[0] === '--weights') {
  const reports = args.slice(1).map((path) => JSON.parse(readFileSync(path, 'utf8')));
  const weights = weightsFromVitestReports(reports);
  // Reports with no test files must not overwrite the table with `{}`.
  if (Object.keys(weights).length === 0) {
    console.error('no test files found in those reports');
    process.exit(1);
  }
  writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2) + '\n');
  console.error(`wrote ${Object.keys(weights).length} weights to ${WEIGHTS_PATH}`);
  process.exit(0);
}

const [current, total] = (args[args.indexOf('--shard') + 1] ?? '').split('/').map(Number);
if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || current > total) {
  console.error('usage: test-shard.mjs --shard <current>/<total>');
  process.exit(2);
}

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .filter(isUnitTestFile);
const weights = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'));
const mine = partitionByWeight(files, weights, total)[current - 1];
// Nothing at all for an empty shard: a bare newline would reach Vitest as one
// empty filter, which it reads as "run everything".
if (mine.length > 0) console.log(mine.join('\n'));
