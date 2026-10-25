#!/usr/bin/env node
/**
 * Decides whether this PR run needs the vitest shards, for ci.yml's
 * `tests-needed` job:
 *   node scripts/needs-tests.mjs      (appends `run_tests=true|false` to $GITHUB_OUTPUT)
 *
 * Diffs the merge commit against its base (see lib/changedFiles.mjs). Anything
 * that does not look like that answers `true`: a wasted test run is cheap, a
 * skipped one that mattered is not.
 */
import { appendFileSync } from 'node:fs';
import { changedFiles } from './lib/changedFiles.mjs';
import { needsTests } from './lib/testRelevance.mjs';

const files = changedFiles('needs-tests');
const run = needsTests(files);
console.log(`needs-tests: ${files.length} changed files, tests ${run ? 'needed' : 'skipped'}`);
if (!run) console.log(files.map((file) => `  ${file}`).join('\n'));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_tests=${run}\n`);
