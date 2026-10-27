#!/usr/bin/env node
// Verify the husky pre-commit hook is actually installed and runnable.
//
// `npx husky` (run by `npm install`'s `prepare` script, or explicitly by
// scripts/next-ticket/setup-worktree.mjs) exits 0 unconditionally in husky
// v9 — even when it silently did nothing, e.g. because `.git` couldn't be
// found or the underlying `git config core.hooksPath ...` write failed. Its
// exit code is therefore not proof the hook is live. This checks the actual
// on-disk result instead: that `core.hooksPath` is set and that the file it
// points at actually exists (and, on POSIX, is executable).
//
// Usage:
//   node scripts/verify-husky.mjs          # verify only; exit 1 if broken
//   node scripts/verify-husky.mjs --fix    # if broken, try `npx husky` once, then re-verify
//
// Also exports `verifyHuskyHook(cwd)` for reuse by
// scripts/next-ticket/setup-worktree.mjs, so worktree setup can fail loudly
// instead of trusting `npx husky`'s exit code.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function verifyHuskyHook(cwd) {
  let hooksPath;
  try {
    hooksPath = execFileSync('git', ['config', 'core.hooksPath'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    hooksPath = '';
  }

  if (!hooksPath) {
    return {
      ok: false,
      message:
        'git config core.hooksPath is unset — husky never installed the hook (or failed silently).',
    };
  }

  const resolvedHooksDir = path.isAbsolute(hooksPath) ? hooksPath : path.join(cwd, hooksPath);
  const hookFile = path.join(resolvedHooksDir, 'pre-commit');

  if (!fs.existsSync(hookFile)) {
    return {
      ok: false,
      message: `core.hooksPath is "${hooksPath}" but ${hookFile} does not exist — the hook is not installed.`,
    };
  }

  if (process.platform !== 'win32') {
    try {
      fs.accessSync(hookFile, fs.constants.X_OK);
    } catch {
      return { ok: false, message: `${hookFile} exists but is not executable.` };
    }
  }

  return { ok: true, hookFile };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const cwd = process.cwd();
  let result = verifyHuskyHook(cwd);

  if (!result.ok && process.argv.includes('--fix')) {
    console.error(`husky hook not verified (${result.message})`);
    console.error('Attempting `npx husky`...');
    try {
      execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['husky'], {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
    } catch (err) {
      console.error('`npx husky` itself failed:', err.message);
    }
    result = verifyHuskyHook(cwd);
  }

  if (!result.ok) {
    console.error(`husky pre-commit hook is NOT installed: ${result.message}`);
    console.error('Run `npm run verify-hooks -- --fix` and re-check, or `npx husky` manually.');
    process.exit(1);
  }

  console.log(`husky pre-commit hook verified: ${result.hookFile}`);
  process.exit(0);
}
