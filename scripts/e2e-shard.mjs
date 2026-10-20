#!/usr/bin/env node
/**
 * Prints the e2e spec files one CI shard should run, one per line:
 *   node scripts/e2e-shard.mjs --shard 3/8
 *
 * Weights live in e2e/shard-weights.json (seconds of worker time per file).
 * Refresh them from a CI log with `node scripts/e2e-shard.mjs --weights <log>`;
 * a file missing from the table is treated as median, so a new spec needs no
 * edit here to be run.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseListReporterLog, partitionByWeight } from './lib/e2eShards.mjs';

const WEIGHTS_PATH = 'e2e/shard-weights.json';
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];

if (args.includes('--weights')) {
  const weights = parseListReporterLog(readFileSync(flag('--weights'), 'utf8'));
  // A log with no test lines must not overwrite the table with `{}`.
  if (Object.keys(weights).length === 0) {
    console.error('no Playwright list-reporter test lines found in that log');
    process.exit(1);
  }
  writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2) + '\n');
  console.error(`wrote ${Object.keys(weights).length} weights to ${WEIGHTS_PATH}`);
  process.exit(0);
}

const [current, total] = (flag('--shard') ?? '').split('/').map(Number);
if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || current > total) {
  console.error('usage: e2e-shard.mjs --shard <current>/<total>');
  process.exit(2);
}

const files = readdirSync('e2e')
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => `e2e/${name}`);
const weights = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'));
const mine = partitionByWeight(files, weights, total)[current - 1];
// Nothing at all for an empty shard: a bare newline would reach the caller as
// one empty filter, which Playwright reads as "run everything".
if (mine.length > 0) console.log(mine.join('\n'));
