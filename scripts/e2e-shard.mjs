#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { listE2eSpecs } from './lib/e2eSpecs.mjs';
import { parseListReporterLog, partitionByWeight } from './lib/e2eShards.mjs';

const WEIGHTS_PATH = 'e2e/shard-weights.json';
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];

if (args.includes('--weights')) {
  const weights = parseListReporterLog(readFileSync(flag('--weights'), 'utf8'));
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

const files = listE2eSpecs({ skipLayout: args.includes('--skip-layout') });
const weights = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'));
const mine = partitionByWeight(files, weights, total)[current - 1];
if (mine.length > 0) console.log(mine.join('\n'));
