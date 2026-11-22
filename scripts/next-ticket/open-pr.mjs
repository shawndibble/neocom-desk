#!/usr/bin/env node
// Push the branch and open the PR. Mechanism only — the agent still
// authors the title and body (judgment), this just executes them.
//
// Usage: node scripts/next-ticket/open-pr.mjs <title> <body-file> [--hold]
//
// `--hold` (a `hold-for-review` ticket) opens the PR but does NOT arm
// auto-merge: the PR is left for a human to review and merge.
//
// Also arms auto-merge (repo has allow_auto_merge on, and the `ci` check
// is required) so GitHub merges the PR itself the moment it goes
// green and mergeable — finish.mjs no longer races a manual merge against
// it, and a CI-watch hiccup in drive-ci.mjs can't strand an otherwise-green
// PR.
//
// Deliberately `--merge`, not `--squash`: squashing rewrites the branch's
// commits into a new one, which orphans the base of any PR stacked on this
// branch and scrambles its diff. A merge commit preserves those commits, so
// a stack survives the merge. Cost is a noisier `develop` history — accepted.
//
// Prints one line of JSON to stdout:
//   {"status":"open","number":123,"url":"...","autoMergeArmed":true}
//   {"status":"open","number":123,"url":"...","autoMergeArmed":false,"held":true}
//   {"status":"error","message":"..."}

import fs from 'node:fs';
import { run, gh, tryRun, printResult, INTEGRATION_BRANCH } from './lib.mjs';

const [, , title, bodyFile, ...flags] = process.argv;
const hold = flags.includes('--hold');
if (!title || !bodyFile) {
  console.error('usage: open-pr.mjs <title> <body-file> [--hold]');
  process.exit(2);
}
const body = fs.readFileSync(bodyFile, 'utf8');

const push = tryRun('git', ['push', '-u', 'origin', 'HEAD']);
if (!push.ok) {
  printResult({ status: 'error', message: push.stderr.trim() });
  process.exit(1);
}

const create = tryRun('gh', [
  'pr',
  'create',
  '--base',
  INTEGRATION_BRANCH,
  '--title',
  title,
  '--body',
  body,
]);
if (!create.ok) {
  printResult({ status: 'error', message: create.stderr.trim() });
  process.exit(1);
}

const url = create.stdout.trim().split('\n').pop();
const number = Number((/\/pull\/(\d+)/.exec(url) || [])[1]);

if (hold) {
  printResult({ status: 'open', number, url, autoMergeArmed: false, held: true });
  process.exit(0);
}

// Best-effort: a failure here (e.g. auto-merge briefly unavailable) isn't
// fatal — step 9 (finish.mjs) still merges directly as a fallback.
const autoMerge = tryRun('gh', [
  'pr',
  'merge',
  String(number),
  '--merge',
  '--auto',
  '--delete-branch',
]);

printResult({ status: 'open', number, url, autoMergeArmed: autoMerge.ok });
