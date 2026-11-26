#!/usr/bin/env node

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

const autoMerge = tryRun('gh', [
  'pr',
  'merge',
  String(number),
  '--merge',
  '--auto',
  '--delete-branch',
]);

printResult({ status: 'open', number, url, autoMergeArmed: autoMerge.ok });
