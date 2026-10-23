#!/usr/bin/env node
/**
 * Decides whether this PR run needs the e2e shards, for ci.yml's `build` job:
 *   node scripts/needs-e2e.mjs      (appends `run_e2e=true|false` to $GITHUB_OUTPUT)
 *
 * On a `pull_request` run actions/checkout leaves HEAD at GitHub's merge commit
 * (parent 1 = the base branch tip, parent 2 = the PR head), so
 * `HEAD^1..HEAD` is exactly what merging would change. `--no-renames` lists a
 * moved file as a delete plus an add, so moving app code into docs/ still
 * names the app path. Anything that does not
 * look like that (shallow history, no second parent, git failing) answers
 * `true`: a wasted e2e run is cheap, a skipped one that mattered is not.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { needsE2e } from './lib/e2eRelevance.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function changedFiles() {
  try {
    git('rev-parse', '--verify', '--quiet', 'HEAD^2');
    return git('diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD').split('\n').filter(Boolean);
  } catch (error) {
    console.error(`needs-e2e: could not diff against the base (${error.message.split('\n')[0]})`);
    return [];
  }
}

const files = changedFiles();
const run = needsE2e(files);
console.log(`needs-e2e: ${files.length} changed files, e2e ${run ? 'needed' : 'skipped'}`);
if (!run) console.log(files.map((file) => `  ${file}`).join('\n'));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_e2e=${run}\n`);
