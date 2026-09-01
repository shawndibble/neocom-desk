#!/usr/bin/env node
// One round of next-ticket.md step 8: check mergeability, then block on
// CI. Combines the two separate `gh` calls the skill used to make (and
// the merge-state poll) into one. The agent still owns what happens on
// a non-green result — conflict resolution, fix-and-push, re-invoke —
// this script just reports where things stand.
//
// Usage: node scripts/next-ticket/drive-ci.mjs <pr-number>
//
// Prints one line of JSON to stdout:
//   {"status":"conflict"}                                   — run sync-main.mjs, then retry
//   {"status":"green","mergeable":true}                     — proceed to finish.mjs
//   {"status":"checks-failed","failedRunIds":[123456]}       — diagnose, fix, retry
//   {"status":"pending"}                                     — checks still running (rare with --watch)

import { gh, ghJson, tryRun, printResult } from './lib.mjs';

const [, , prArg] = process.argv;
if (!prArg) {
  console.error('usage: drive-ci.mjs <pr-number>');
  process.exit(2);
}

const state = ghJson(['pr', 'view', prArg, '--json', 'mergeStateStatus,mergeable']);
if (state.mergeStateStatus === 'CONFLICTING' || state.mergeStateStatus === 'DIRTY') {
  printResult({ status: 'conflict' });
  process.exit(0);
}

const checks = tryRun('gh', ['pr', 'checks', prArg, '--watch', '--interval', '30']);

if (checks.ok) {
  const final = ghJson(['pr', 'view', prArg, '--json', 'mergeStateStatus,mergeable']);
  if (final.mergeStateStatus === 'CONFLICTING' || final.mergeStateStatus === 'DIRTY') {
    printResult({ status: 'conflict' });
  } else {
    printResult({
      status: 'green',
      mergeable: final.mergeable === 'MERGEABLE' || final.mergeable === true,
    });
  }
  process.exit(0);
}

// `gh pr checks --watch` exits non-zero when any check fails.
let failedRunIds = [];
try {
  const checksJson = ghJson(['pr', 'checks', prArg, '--json', 'name,bucket,link']);
  failedRunIds = checksJson
    .filter((c) => c.bucket === 'fail')
    .map((c) => Number((/\/runs\/(\d+)/.exec(c.link) || [])[1]))
    .filter(Boolean);
} catch {}

printResult({ status: 'checks-failed', failedRunIds });
