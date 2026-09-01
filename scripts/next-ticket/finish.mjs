#!/usr/bin/env node
// Squash-merge, verify the issue closed, and tear down the worktree.
// Replaces next-ticket.md step 9's sequence of separate `gh`/`git` calls.
//
// Usage: node scripts/next-ticket/finish.mjs <pr-number> <issue-number> <worktree-path>
// Must be run from the main checkout (not the worktree being removed).
//
// Prints one line of JSON to stdout:
//   {"status":"merged","issueClosed":true}
//   {"status":"merge-failed","message":"..."}

import { run, gh, ghJson, tryRun, printResult } from './lib.mjs';

const [, , prArg, issueArg, worktreePath] = process.argv;
if (!prArg || !issueArg || !worktreePath) {
  console.error('usage: finish.mjs <pr-number> <issue-number> <worktree-path>');
  process.exit(2);
}

const merge = tryRun('gh', ['pr', 'merge', prArg, '--squash', '--delete-branch']);
if (!merge.ok) {
  printResult({ status: 'merge-failed', message: merge.stderr.trim() });
  process.exit(1);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let issueClosed = false;
for (let i = 0; i < 5; i++) {
  const state = ghJson(['issue', 'view', issueArg, '--json', 'state']).state;
  if (state === 'CLOSED') {
    issueClosed = true;
    break;
  }
  sleep(2000);
}

if (!issueClosed) {
  const prUrl = ghJson(['pr', 'view', prArg, '--json', 'url']).url;
  gh(['issue', 'close', issueArg, '--comment', `Merged in ${prUrl}`]);
  issueClosed = true;
}

tryRun('gh', ['issue', 'edit', issueArg, '--remove-label', 'in-progress']);

tryRun('git', ['worktree', 'remove', worktreePath, '--force']);
run('git', ['worktree', 'prune']);

printResult({ status: 'merged', issueClosed });
