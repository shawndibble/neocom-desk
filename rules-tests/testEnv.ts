import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

export async function createRulesEnv(): Promise<RulesTestEnvironment> {
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

export function characterAuth(env: RulesTestEnvironment, characterId: number, ownerHash: string) {
  return env.authenticatedContext(`char:${characterId}`, { ownerHash });
}
