/**
 * What the Corp Tax Book browser tests' config (`playwright.book.config.ts`), its emulator
 * launcher (`scripts/e2e-book/emulators.mjs`) and the specs agree on.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where the launcher writes the run's token signing key and the specs read it. */
export const KEY_DIR = join(tmpdir(), 'neocom-e2e-book');
/** The EVE client id every e2e run builds the app with (playwright.config.ts's E2E_ENV). */
export const EVE_CLIENT_ID = 'e2e-fake-client';
/** The emulators' demo project (`EMULATOR_PROJECT_ID`, src/sync/firebaseCore.ts). */
export const PROJECT_ID = 'demo-neocom-desk';
export const FIRESTORE = 'http://127.0.0.1:8080';
/** The hosts the app may reach besides its own server: the three emulators (firebase.json). */
export const EMULATOR_HOSTS = ['127.0.0.1:9099', '127.0.0.1:8080', '127.0.0.1:5001'];
