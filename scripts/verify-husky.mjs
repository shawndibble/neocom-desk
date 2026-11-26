#!/usr/bin/env node

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
