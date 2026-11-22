#!/usr/bin/env node
/**
 * Picks the unit test files this run executes, for ci.yml's `select-tests` job:
 *   node scripts/select-tests.mjs <out-file>
 * writes the files to <out-file>, one per line, and appends `test_shards` and
 * `test_matrix` to $GITHUB_OUTPUT.
 *
 * A pull request runs the tests whose import graph holds a changed file
 * (`vitest list --changed`); the full run (`CI_FULL=true`) and any change that
 * can move every test (`needsFullUnitRun`) run all of them. `develop-full.yml`
 * is what catches a cross-cutting break a narrowed PR run could not see.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { changedFiles } from './lib/changedFiles.mjs';
import { needsFullUnitRun, parseVitestListFiles, shardCount, shardMatrix } from './lib/ciPlan.mjs';
import { isUnitTestFile } from './lib/testShards.mjs';

/** Seconds of wall time per shard to aim for (scripts/test-shard-weights.json). */
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
    // HEAD^1 is the base the merge commit was made against (lib/changedFiles.mjs).
    const out = execFileSync('npx', ['vitest', 'list', '--changed', 'HEAD^1', '--filesOnly'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return {
      files: parseVitestListFiles(out).filter(isUnitTestFile),
      why: 'affected by the change',
    };
  } catch (error) {
    // Cannot tell what is affected: run everything rather than nothing.
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
