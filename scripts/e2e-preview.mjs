#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const SOURCE_INPUTS = ['src', 'public', 'index.html', 'vite.config.ts', 'package.json'];

const testSupportDir = join(repoRoot, 'src', 'test');
const isExcludedFile = (name) =>
  /\.test\.tsx?$/.test(name) || name === 'test-helpers.ts' || name.endsWith('.stories.tsx');
const isExcludedDir = (dir, name) => name === '__tests__' || join(dir, name) === testSupportDir;

function newestMtimeMs(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return 0;
  }
  if (!stats.isDirectory()) return stats.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() ? isExcludedDir(path, entry.name) : isExcludedFile(entry.name))
      continue;
    newest = Math.max(newest, newestMtimeMs(join(path, entry.name)));
  }
  return newest;
}

function fail(message) {
  console.error(`\n[e2e-preview] ${message}\n`);
  process.exit(1);
}

const distIndexMtime = newestMtimeMs(join(repoRoot, 'dist', 'index.html'));
if (distIndexMtime === 0) {
  fail(
    'dist/ is missing. The `built` Playwright project renders the production ' +
      'bundle, so it needs one: run `npm run build` before `npx playwright test`.'
  );
}

const skipStaleCheck = process.env.E2E_PREVIEW_SKIP_STALE_CHECK === '1';
const newestSourceMtime = skipStaleCheck
  ? 0
  : Math.max(...SOURCE_INPUTS.map((input) => newestMtimeMs(join(repoRoot, input))));
if (newestSourceMtime > distIndexMtime) {
  fail(
    'dist/ is older than the sources it was built from, so the `built` ' +
      'project would assert against a stale bundle and pass for the wrong ' +
      'reason. Re-run `npm run build`.'
  );
}

const vite = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, 'preview', ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
