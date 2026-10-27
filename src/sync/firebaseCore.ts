// The bare Firebase app instance, importing `firebase/app` and nothing else.
// Split from `firebaseApp.ts` (which re-exports it) so a caller that needs only
// the app — Firebase Analytics in `app/analytics.ts` — loads ~10 KB instead of
// auth + firestore/lite + functions as well. Still Firebase: import it only
// behind `await import(...)` from anything the startup bundle reaches (see the
// code-splitting note in `sync/index.ts`).

import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

// Dev-only: `VITE_FIREBASE_EMULATORS=1` (with `npm run emulators`, issue #4190).
// `import.meta.env.DEV` is compile-time false in a production build.
export const emulatorsOn = (): boolean =>
  import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === '1';
// The emulators run under this demo project, and both Firestore data and the
// Functions URLs are namespaced by it, so the client must use the same id.
export const EMULATOR_PROJECT_ID = 'demo-neocom-desk';

function firebaseOptions() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: emulatorsOn() ? EMULATOR_PROJECT_ID : import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

const DEFAULT_APP_NAME = '[DEFAULT]';
const CHARACTER_APP_PREFIX = 'char-';

/** The default app: analytics and callables. It holds no Character session. */
export function getFirebaseApp(): FirebaseApp {
  const existing = getApps().find((app) => app.name === DEFAULT_APP_NAME);
  return existing ?? initializeApp(firebaseOptions());
}

/**
 * One named app per Character, so each has its own Auth, Firestore and
 * persisted session (the persistence key includes the app name).
 */
export function getCharacterApp(characterId: number): FirebaseApp {
  const name = CHARACTER_APP_PREFIX + characterId;
  const existing = getApps().find((app) => app.name === name);
  return existing ?? initializeApp(firebaseOptions(), name);
}

/** Drop a Character's app; no-op when it was never started on this page. */
export async function deleteCharacterApp(characterId: number): Promise<void> {
  const name = CHARACTER_APP_PREFIX + characterId;
  const existing = getApps().find((app) => app.name === name);
  if (existing) await deleteApp(existing);
}

/** Ids of every Character app started on this page. */
export function startedCharacterIds(): number[] {
  return getApps()
    .filter((app) => app.name.startsWith(CHARACTER_APP_PREFIX))
    .map((app) => Number(app.name.slice(CHARACTER_APP_PREFIX.length)));
}
