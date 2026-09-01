// Shared helpers for scripts/next-ticket/*.mjs. No deps; Node built-ins only.
import { execFileSync } from 'node:child_process';

export function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

export function tryRun(cmd, args, opts = {}) {
  try {
    return { ok: true, stdout: run(cmd, args, opts) };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || String(err) };
  }
}

export function gh(args, opts = {}) {
  return run('gh', args, opts);
}

export function ghJson(args, opts = {}) {
  return JSON.parse(gh(args, opts));
}

export function log(...args) {
  console.error(...args);
}

export function printResult(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
