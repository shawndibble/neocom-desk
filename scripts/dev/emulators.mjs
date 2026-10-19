#!/usr/bin/env node
// `npm run emulators` (issue #4190): builds functions/ and starts the Auth,
// Firestore and Functions emulators under a `demo-` project id, so nothing can
// touch a real Firebase project. Needs a Java runtime (the Firestore emulator
// is a JAR). `mintFirebaseToken` throws at cold start without EVE_CLIENT_ID and
// the emulator's function discovery does not read functions/.env here, so this
// passes it through the environment: EVE_CLIENT_ID if set, else the root
// .env.local / .env VITE_EVE_CLIENT_ID (the dev EVE application the app uses).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const win = process.platform === 'win32';

function viteClientId() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const match = /^VITE_EVE_CLIENT_ID=(.+)$/m.exec(readFileSync(file, 'utf8'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const clientId = process.env.EVE_CLIENT_ID || viteClientId();
if (!clientId) {
  console.error(
    'Set EVE_CLIENT_ID, or VITE_EVE_CLIENT_ID in .env (the dev EVE application client_id).'
  );
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(win ? `${cmd}.cmd` : cmd, args, {
    stdio: 'inherit',
    shell: win,
    env: { ...process.env, EVE_CLIENT_ID: clientId },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['--prefix', 'functions', 'run', 'build']);
run('npx', [
  '--yes',
  'firebase-tools@14.27.0',
  'emulators:start',
  '--only',
  'auth,firestore,functions',
  '--project',
  'demo-neocom-desk',
]);
