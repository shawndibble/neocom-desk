import { describe } from 'vitest';
import { setTimeoutHandler } from '@google-cloud/firestore/build/src/backoff.js';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-neocom-rules';

const emulatorRunnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

export const emulatorSuite = emulatorRunnable ? describe : describe.skip;

function openDb(): Firestore {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

export const emulatorDb: Firestore = emulatorRunnable
  ? openDb()
  : (undefined as unknown as Firestore);

export async function clearEmulator(): Promise<void> {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

export function staggerTransactionRetries(stepMs = 25): () => void {
  let retries = 0;
  setTimeoutHandler((fn) => {
    retries += 1;
    setTimeout(fn, stepMs * retries);
  });
  return () => setTimeoutHandler((fn, ms) => void setTimeout(fn, ms));
}
