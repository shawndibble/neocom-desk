#!/usr/bin/env node
// Create the isolated worktree for a ticket and install deps. Replaces
// next-ticket.md step 3's sequence of separate Bash calls with one.
//
// Usage: node scripts/next-ticket/setup-worktree.mjs <issue-number> <slug>
//
// Prints one line of JSON to stdout:
//   {"status":"ready","worktreePath":"...","branch":"claude/83-item-tooltip"}
//   {"status":"error","step":"worktree-add|npm-ci","message":"..."}

import fs from 'node:fs';
import path from 'node:path';
import { run, tryRun, log, printResult } from './lib.mjs';

const [, , issueArg, slug] = process.argv;
if (!issueArg || !slug) {
  console.error('usage: setup-worktree.mjs <issue-number> <slug>');
  process.exit(2);
}

const startCwd = process.cwd();
const repoRoot = run('git', ['rev-parse', '--show-toplevel']).trim();
const worktreeRoot = path.join(path.dirname(repoRoot), 'neocom-desk.worktrees');
const worktreePath = path.join(worktreeRoot, `${issueArg}-${slug}`);
const branch = `claude/${issueArg}-${slug}`;

if (fs.existsSync(worktreePath)) {
  log(`removing stale worktree dir ${worktreePath}`);
  fs.rmSync(worktreePath, { recursive: true, force: true });
}

fs.mkdirSync(worktreeRoot, { recursive: true });

const add = tryRun('git', ['worktree', 'add', worktreePath, '-b', branch, 'main'], {
  cwd: repoRoot,
});
if (!add.ok) {
  printResult({ status: 'error', step: 'worktree-add', message: add.stderr.trim() });
  process.exit(1);
}

const envFile = path.join(startCwd, '.env');
if (fs.existsSync(envFile)) {
  fs.copyFileSync(envFile, path.join(worktreePath, '.env'));
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ci = tryRun(npmCmd, ['ci'], { cwd: worktreePath, shell: process.platform === 'win32' });
if (!ci.ok) {
  printResult({ status: 'error', step: 'npm-ci', message: ci.stderr.trim().slice(-4000) });
  process.exit(1);
}

// `npm ci`'s `prepare` lifecycle script (which installs the husky
// pre-commit hook) is silently skipped whenever `ignore-scripts` is set —
// true in this agent's sandboxed shell. Install it explicitly so the hook
// is live regardless of that setting.
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const husky = tryRun(npxCmd, ['husky'], { cwd: worktreePath, shell: process.platform === 'win32' });
if (!husky.ok) {
  printResult({ status: 'error', step: 'husky-install', message: husky.stderr.trim().slice(-4000) });
  process.exit(1);
}

printResult({ status: 'ready', worktreePath, branch });
