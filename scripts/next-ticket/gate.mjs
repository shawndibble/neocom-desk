#!/usr/bin/env node

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
