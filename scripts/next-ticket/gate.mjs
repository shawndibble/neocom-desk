#!/usr/bin/env node
// Local gate mirroring CI. Runs format:check/lint/typecheck/test:run
// concurrently (they're independent) instead of the sequential
// `&&`-chain in next-ticket.md step 6 — same checks, less wall time.
// `build` is deferred behind --build since it's the slowest check and
// only needs to run once the rest is already green (final round before
// opening/updating the PR), not on every fix-and-retry loop.
//
// Usage: node scripts/next-ticket/gate.mjs [--build]
//
// Prints one line of JSON to stdout:
//   {"status":"pass"}
//   {"status":"fail","failed":["lint","test:run"],"output":{"lint":"...tail...","test:run":"...tail..."}}
// Exits 0 on pass, 1 on fail.

import { spawn } from 'node:child_process';
import { printResult } from './lib.mjs';

const withBuild = process.argv.includes('--build');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const TAIL_CHARS = 4000;

function runScript(scriptName) {
  return new Promise((resolve) => {
    const child = spawn(npmCmd, ['run', scriptName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ scriptName, code, out }));
  });
}

const parallel = ['format:check', 'lint', 'typecheck', 'test:run'];
const results = await Promise.all(parallel.map(runScript));

const failed = results.filter((r) => r.code !== 0);
if (failed.length > 0) {
  printResult({
    status: 'fail',
    failed: failed.map((r) => r.scriptName),
    output: Object.fromEntries(failed.map((r) => [r.scriptName, r.out.slice(-TAIL_CHARS)])),
  });
  process.exit(1);
}

if (withBuild) {
  const buildResult = await runScript('build');
  if (buildResult.code !== 0) {
    printResult({
      status: 'fail',
      failed: ['build'],
      output: { build: buildResult.out.slice(-TAIL_CHARS) },
    });
    process.exit(1);
  }
}

printResult({ status: 'pass' });
