import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

/**
 * Boots a rules test environment against the Firestore emulator that
 * `npm run test:rules` starts, loaded with the repo's `firestore.rules`.
 * FIRESTORE_EMULATOR_HOST is set by `firebase emulators:exec`.
 */
export async function createRulesEnv(): Promise<RulesTestEnvironment> {
  // Every `assertFails` makes the SDK print its PERMISSION_DENIED stream error and the
  // emulator's rule trace: ~500 stderr blocks per CI run, for denials the tests expect.
  setLogLevel('silent');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  return initializeTestEnvironment({
    projectId: 'demo-neocom-rules',
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
}

/** Auth context as `mintFirebaseToken` mints it: uid `char:{id}` + ownerHash claim. */
export function characterAuth(env: RulesTestEnvironment, characterId: number, ownerHash: string) {
  return env.authenticatedContext(`char:${characterId}`, { ownerHash });
}
