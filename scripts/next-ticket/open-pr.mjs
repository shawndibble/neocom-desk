#!/usr/bin/env node
// Push the branch and open the PR. Mechanism only — the agent still
// authors the title and body (judgment), this just executes them.
//
// Usage: node scripts/next-ticket/open-pr.mjs <title> <body-file>
//
// Prints one line of JSON to stdout:
//   {"status":"open","number":123,"url":"https://github.com/.../pull/123"}
//   {"status":"error","message":"..."}

import fs from 'node:fs';
import { run, gh, tryRun, printResult } from './lib.mjs';

const [, , title, bodyFile] = process.argv;
if (!title || !bodyFile) {
  console.error('usage: open-pr.mjs <title> <body-file>');
  process.exit(2);
}
const body = fs.readFileSync(bodyFile, 'utf8');

const push = tryRun('git', ['push', '-u', 'origin', 'HEAD']);
if (!push.ok) {
  printResult({ status: 'error', message: push.stderr.trim() });
  process.exit(1);
}

const create = tryRun('gh', ['pr', 'create', '--base', 'main', '--title', title, '--body', body]);
if (!create.ok) {
  printResult({ status: 'error', message: create.stderr.trim() });
  process.exit(1);
}

const url = create.stdout.trim().split('\n').pop();
const number = Number((/\/pull\/(\d+)/.exec(url) || [])[1]);
printResult({ status: 'open', number, url });
