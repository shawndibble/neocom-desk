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
import { partitionByWeight } from './lib/e2eShards.mjs';

const WEIGHTS_PATH = 'e2e/shard-weights.json';
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];

if (args.includes('--weights')) {
  // Sums the `(1.2s)` durations Playwright's list reporter prints per test.
  const log = readFileSync(flag('--weights'), 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const weights = {};
  for (const m of log.matchAll(/ [✓✘] +\d+ \[\w+\] › (e2e\/[^:]+):\S+ › .* \(([\d.]+)(m?s)\)$/gm)) {
    weights[m[1]] = (weights[m[1]] ?? 0) + Number(m[2]) / (m[3] === 'ms' ? 1000 : 1);
  }
  const sorted = Object.fromEntries(
    Object.entries(weights)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, s]) => [file, Math.round(s)])
  );
  writeFileSync(WEIGHTS_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.error(`wrote ${Object.keys(sorted).length} weights to ${WEIGHTS_PATH}`);
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
console.log(partitionByWeight(files, weights, total)[current - 1].join('\n'));
