#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { run, tryRun, log, printResult, INTEGRATION_BRANCH } from './lib.mjs';
import { verifyHuskyHook } from '../verify-husky.mjs';

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

const fetch = tryRun('git', ['fetch', 'origin', INTEGRATION_BRANCH], { cwd: repoRoot });
if (!fetch.ok) {
  printResult({ status: 'error', step: 'fetch', message: fetch.stderr.trim() });
  process.exit(1);
}
const add = tryRun(
  'git',
  ['worktree', 'add', '--no-track', worktreePath, '-b', branch, `origin/${INTEGRATION_BRANCH}`],
  { cwd: repoRoot }
);
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

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const husky = tryRun(npxCmd, ['husky'], { cwd: worktreePath, shell: process.platform === 'win32' });
if (!husky.ok) {
  printResult({
    status: 'error',
    step: 'husky-install',
    message: husky.stderr.trim().slice(-4000),
  });
  process.exit(1);
}

const verify = verifyHuskyHook(worktreePath);
if (!verify.ok) {
  printResult({ status: 'error', step: 'husky-verify', message: verify.message });
  process.exit(1);
}

printResult({ status: 'ready', worktreePath, branch });
