#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { changedFiles } from './lib/changedFiles.mjs';
import { needsFullUnitRun, parseVitestListFiles, shardCount, shardMatrix } from './lib/ciPlan.mjs';
import { isUnitTestFile } from './lib/testShards.mjs';

const SHARD_TARGET_WEIGHT = 300;
const MAX_SHARDS = 4;

const outFile = process.argv[2];
if (!outFile) {
  console.error('usage: select-tests.mjs <out-file>');
  process.exit(2);
}

const allTests = () =>
  execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(isUnitTestFile);

function select() {
  if (process.env.CI_FULL === 'true') return { files: allTests(), why: 'full run' };
  const changed = changedFiles('select-tests');
  if (needsFullUnitRun(changed))
    return { files: allTests(), why: 'a change that can move every test' };
  try {
    const out = execFileSync('npx', ['vitest', 'list', '--changed', 'HEAD^1', '--filesOnly'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return {
      files: parseVitestListFiles(out).filter(isUnitTestFile),
      why: 'affected by the change',
    };
  } catch (error) {
    console.error(`select-tests: vitest list failed (${String(error.message).split('\n')[0]})`);
    return { files: allTests(), why: 'vitest could not list the affected tests' };
  }
}

const { files, why } = select();
const weights = JSON.parse(readFileSync('scripts/test-shard-weights.json', 'utf8'));
const shards = shardCount(files, weights, SHARD_TARGET_WEIGHT, MAX_SHARDS);
writeFileSync(outFile, files.join('\n') + (files.length ? '\n' : ''));
console.log(`select-tests: ${files.length} test files (${why}) in ${shards} shards`);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `test_shards=${shards}\ntest_matrix=${shardMatrix(shards)}\n`
  );
