#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { partitionByWeight } from './lib/e2eShards.mjs';
import { isUnitTestFile, weightsFromVitestReports } from './lib/testShards.mjs';

const WEIGHTS_PATH = 'scripts/test-shard-weights.json';
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];

if (args.includes('--weights')) {
  const reports = args
    .slice(args.indexOf('--weights') + 1)
    .map((path) => JSON.parse(readFileSync(path, 'utf8')));
  const weights = weightsFromVitestReports(reports);
  if (Object.keys(weights).length === 0) {
    console.error('no test files found in those reports');
    process.exit(1);
  }
  writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2) + '\n');
  console.error(`wrote ${Object.keys(weights).length} weights to ${WEIGHTS_PATH}`);
  process.exit(0);
}

const [current, total] = (flag('--shard') ?? '').split('/').map(Number);
if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || current > total) {
  console.error('usage: test-shard.mjs --shard <current>/<total>');
  process.exit(2);
}

const files = args.includes('--from')
  ? readFileSync(flag('--from'), 'utf8').split('\n').filter(isUnitTestFile)
  : execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(isUnitTestFile);
const weights = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'));
const mine = partitionByWeight(files, weights, total)[current - 1];
if (mine.length > 0) console.log(mine.join('\n'));
