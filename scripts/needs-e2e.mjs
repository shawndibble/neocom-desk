#!/usr/bin/env node
/**
 * Decides whether this PR run needs the e2e shards, for ci.yml's `build` job:
 *   node scripts/needs-e2e.mjs      (appends `run_e2e=true|false` to $GITHUB_OUTPUT)
 *
 * Diffs the merge commit against its base (see lib/changedFiles.mjs). Anything
 * that does not look like that answers `true`: a wasted e2e run is cheap, a
 * skipped one that mattered is not.
 */
import { appendFileSync } from 'node:fs';
import { changedFiles } from './lib/changedFiles.mjs';
import { needsE2e } from './lib/e2eRelevance.mjs';

const files = changedFiles('needs-e2e');
const run = needsE2e(files);
console.log(`needs-e2e: ${files.length} changed files, e2e ${run ? 'needed' : 'skipped'}`);
if (!run) console.log(files.map((file) => `  ${file}`).join('\n'));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_e2e=${run}\n`);
