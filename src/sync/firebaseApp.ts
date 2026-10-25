// Lazy Firebase initialization from Vite env. Firebase exists ONLY to sync
// editable data (ADR 0001): no EVE tokens ever flow through it except the
// short-lived access token sent to the mintFirebaseToken callable. (The first
// named exception, the public contract snapshots of ADR 0013, is gone: they
// are read from Cloudflare R2 since issue #4270.)
// Second named exception: `app/analytics.ts` reads `measurementId` off this
// same app instance to init Firebase Analytics (GA4) — product usage
// telemetry, not sync data (see docs/context/decisions/
// 20260910-113731-add-google-analytics-ga4-via-firebase.md).
// Third: `features/share/shareStore.ts` writes and reads stored Share Links in
// the public `shares` collection — content a pilot chose to share, carrying no
// uid or Character id (docs/context/decisions/
// 20261002-125432-stored-short-share-links-in-firestore.md).
// Fourth: `market/mutamarket.ts` calls the `mutamarketEstimate` function for
// abyssal module estimates (MutaMarket has no CORS), on any Character's session.

import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore/lite';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { deleteCharacterApp, emulatorsOn, getCharacterApp, getFirebaseApp } from './firebaseCore';

export { getFirebaseApp };

// Dev-only: `VITE_FIREBASE_EMULATORS=1` in `.env.local` points the three
// services at `npm run emulators` (ports in firebase.json). `import.meta.env.DEV`
// is compile-time false in a production build, so the branch and the emulator
// hosts below are dead code there. Each connector may be called only once per
// instance (Firebase throws on a second call after first use), hence the guards.
const EMULATOR_HOST = '127.0.0.1';
const authInstances = new Map<number, Auth>();
const firestoreConnected = new Set<number>();
let functionsConnected = false;

/**
 * A Character's own Auth, with its own persisted session (issue #5074). Same
 * persistence as `getAuth` minus `browserPopupRedirectResolver`: that resolver
 * loads Google's gapi iframe (`apis.google.com`, third-party cookies) as soon
 * as Auth starts, and the app only ever signs in with a custom token.
 */
export function getSyncAuth(characterId: number): Auth {
  let auth = authInstances.get(characterId);
  if (!auth) {
    auth = initializeAuth(getCharacterApp(characterId), {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
    authInstances.set(characterId, auth);
    if (emulatorsOn()) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    }
  }
  return auth;
}

/** The Firestore that sends this Character's session. */
export function getSyncFirestore(characterId: number): Firestore {
  const firestore = getFirestore(getCharacterApp(characterId));
  if (emulatorsOn() && !firestoreConnected.has(characterId)) {
    firestoreConnected.add(characterId);
    connectFirestoreEmulator(firestore, EMULATOR_HOST, 8080);
  }
  return firestore;
}

/**
 * The pre-#5074 shared session, in the default app. Only for signing a device
 * out: it may still be persisted from before, holding a Character's credential.
 */
export function getLegacySyncAuth(): Auth {
  return initializeAuth(getFirebaseApp(), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  });
}

/** Delete a Character's app and with it its persisted session. */
export async function disposeCharacterApp(characterId: number): Promise<void> {
  authInstances.delete(characterId);
  firestoreConnected.delete(characterId);
  await deleteCharacterApp(characterId);
}

export function getSyncFunctions(): Functions {
  const functions = getFunctions(getFirebaseApp());
  if (emulatorsOn() && !functionsConnected) {
    functionsConnected = true;
    connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  }
  return functions;
}
