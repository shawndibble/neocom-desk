#!/usr/bin/env node

import { run, tryRun, printResult, INTEGRATION_BRANCH } from './lib.mjs';

const remoteRef = `origin/${INTEGRATION_BRANCH}`;
run('git', ['fetch', 'origin', INTEGRATION_BRANCH]);

const before = run('git', ['rev-parse', 'HEAD']).trim();
const mainRef = run('git', ['rev-parse', remoteRef]).trim();

if (before === mainRef) {
  printResult({ status: 'already-up-to-date' });
  process.exit(0);
}

const merge = tryRun('git', ['merge', remoteRef, '--no-edit']);
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
