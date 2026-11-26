#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { E2E_BOOK_KEY_DIR, EVE_CLIENT_ID } = process.env;
if (!E2E_BOOK_KEY_DIR || !EVE_CLIENT_ID) {
  console.error(
    'Run through playwright.book.config.ts: it sets E2E_BOOK_KEY_DIR and EVE_CLIENT_ID.'
  );
  process.exit(1);
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const stub = fileURLToPath(new URL('./ccpStub.mjs', import.meta.url));

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const kid = `e2e-${Date.now()}`;
mkdirSync(E2E_BOOK_KEY_DIR, { recursive: true });
writeFileSync(
  `${E2E_BOOK_KEY_DIR}/jwks.json`,
  JSON.stringify({
    keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }],
  })
);
writeFileSync(
  `${E2E_BOOK_KEY_DIR}/signing.json`,
  JSON.stringify({ kid, jwk: privateKey.export({ format: 'jwk' }) })
);

const build = spawnSync('npm', ['--prefix', 'functions', 'run', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const child = spawn(
  'npx',
  [
    '--yes',
    'firebase-tools@14.27.0',
    'emulators:start',
    '--only',
    'auth,firestore,functions',
    '--project',
    'demo-neocom-desk',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      EVE_CLIENT_ID,
      E2E_BOOK_KEY_DIR,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${stub}`.trim(),
    },
  }
);
const stop = () => child.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
