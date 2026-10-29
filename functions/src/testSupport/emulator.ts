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
