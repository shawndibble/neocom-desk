/**
 * The Firestore-emulator preamble every `*Emulator.test.ts` in this package
 * shares (ADR 0026). Those suites run only under `npm run test:rules` at the
 * repo root, which starts the emulator and sets `FIRESTORE_EMULATOR_HOST`; a
 * plain `npm test` skips them.
 *
 * Test-only: `tsconfig.build.json` keeps it out of `lib/` and `firebase.json`'s
 * `ignore` keeps it out of the upload, so it never reaches a deploy.
 */
import { describe } from 'vitest';
import { setTimeoutHandler } from '@google-cloud/firestore/build/src/backoff.js';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** The project `npm run test:rules` starts the emulator with. */
const PROJECT_ID = 'demo-neocom-rules';

const emulatorRunnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/** `describe`, or `describe.skip` when there is no emulator to talk to. */
export const emulatorSuite = emulatorRunnable ? describe : describe.skip;

function openDb(): Firestore {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

/**
 * The admin Firestore pointed at the emulator. Nothing initializes without an
 * emulator to point at, so this is undefined at runtime then — which no test
 * reads, because `emulatorSuite` has skipped every suite that would.
 */
export const emulatorDb: Firestore = emulatorRunnable
  ? openDb()
  : (undefined as unknown as Firestore);

/** The emulator's own wipe: BulkWriter-based recursiveDelete trips its rate limiter here. */
export async function clearEmulator(): Promise<void> {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

/**
 * Staggers the Admin SDK's retries of aborted transactions, for a test that races two of them on
 * one document. Both read the document, then both write it, so the emulator aborts them
 * (`Transaction lock timeout` in its log). The SDK then waits 1 s, give or take half, growing 1.5x
 * per retry (observed: the racing test took about 3.3 s, and past vitest's 5 s limit on a slow
 * runner), and retrying both at once would deadlock them again. Here the Nth retry waits
 * `N * stepMs`, so the first one commits before the second one reads, and the second then finds
 * the claim already decided. Uses the SDK's own test hook (`setTimeoutHandler`, marked test-only),
 * so every `delayExecution` wait is replaced while it is installed. Returns the restore; call it
 * in a `finally`.
 *
 * Recheck after a `firebase-admin` or `@google-cloud/firestore` bump: if the SDK stops routing
 * retries through that hook this becomes a silent no-op, and the two race tests (srpOfficer,
 * vetting) go back to about 3 s and flaky. The import is a deep path into a transitive dependency.
 */
export function staggerTransactionRetries(stepMs = 25): () => void {
  let retries = 0;
  setTimeoutHandler((fn) => {
    retries += 1;
    setTimeout(fn, stepMs * retries);
  });
  return () => setTimeoutHandler((fn, ms) => void setTimeout(fn, ms));
}
