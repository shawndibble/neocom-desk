#!/usr/bin/env node
/**
 * Serves `dist/` for the Playwright `built` project (#205) — but refuses to
 * start on a `dist/` that is missing or older than the sources it was built
 * from.
 *
 * `vite preview` on its own would happily serve a stale bundle, and the
 * whole point of that project is to catch a production-only CSS regression:
 * a run against yesterday's `dist/` passes green while proving nothing. The
 * failure has to be loud, which means here, at server start, rather than as
 * a confusing assertion failure three specs later.
 */
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Everything whose edit should invalidate `dist/`. `src/` covers the
 * stylesheet the built project exists to check; `index.html` and the Vite
 * config shape the bundle itself.
 */
const SOURCE_INPUTS = ['src', 'public', 'index.html', 'vite.config.ts', 'package.json'];

/**
 * Editing a test never changes the bundle, so it must not mark it stale.
 * This mirrors `tsconfig.src.json`'s `exclude` rather than inventing its
 * own rule — the two answer the same question ("is this a bundle input?"),
 * and a looser rule here reports a stale `dist/` that a rebuild won't fix.
 */
const testSupportDir = join(repoRoot, 'src', 'test');
const isExcludedFile = (name) =>
  /\.test\.tsx?$/.test(name) || name === 'test-helpers.ts' || name.endsWith('.stories.tsx');
const isExcludedDir = (dir, name) => name === '__tests__' || join(dir, name) === testSupportDir;

function newestMtimeMs(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return 0; // Optional input (e.g. no `public/`) — nothing to compare.
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

// CI builds `dist/` in one job and downloads it into the shards, so its mtimes
// carry no information there; that job opts out of the comparison.
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

// The vite binary directly rather than `npm run preview`, so there is no
// shell or `.cmd` shim between Playwright's process tree and the server it
// has to be able to kill.
const vite = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, 'preview', ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
