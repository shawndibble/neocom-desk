#!/usr/bin/env node
// Fetch and merge origin/main into the current branch. Mechanism only —
// on conflict this reports it and stops; the resolving-merge-conflicts
// skill (agent judgment) resolves and commits, not this script.
//
// Usage: node scripts/next-ticket/sync-main.mjs
//
// Prints one line of JSON to stdout:
//   {"status":"already-up-to-date"}
//   {"status":"merged"}
//   {"status":"conflict","files":["src/foo.ts", ...]}

import { run, tryRun, printResult } from './lib.mjs';

run('git', ['fetch', 'origin', 'main']);

const before = run('git', ['rev-parse', 'HEAD']).trim();
const mainRef = run('git', ['rev-parse', 'origin/main']).trim();

if (before === mainRef) {
  printResult({ status: 'already-up-to-date' });
  process.exit(0);
}

const merge = tryRun('git', ['merge', 'origin/main', '--no-edit']);
if (merge.ok) {
  printResult({ status: 'merged' });
  process.exit(0);
}

const statusOut = run('git', ['diff', '--name-only', '--diff-filter=U']);
const files = statusOut
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
printResult({ status: 'conflict', files });
process.exit(0);
