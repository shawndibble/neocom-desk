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
import { emulatorsOn, getFirebaseApp } from './firebaseCore';

export { getFirebaseApp };

// Dev-only: `VITE_FIREBASE_EMULATORS=1` in `.env.local` points the three
// services at `npm run emulators` (ports in firebase.json). `import.meta.env.DEV`
// is compile-time false in a production build, so the branch and the emulator
// hosts below are dead code there. Each connector may be called only once per
// instance (Firebase throws on a second call after first use), hence the guards.
const EMULATOR_HOST = '127.0.0.1';
let authConnected = false;
let firestoreConnected = false;
let functionsConnected = false;

let syncAuth: Auth | undefined;

/**
 * Auth as `getAuth` builds it (same persistence, so a session saved before this
 * change still restores) minus `browserPopupRedirectResolver`: that resolver
 * loads Google's gapi iframe (`apis.google.com`, third-party cookies) as soon
 * as Auth starts, and the app only ever signs in with a custom token.
 */
export function getSyncAuth(): Auth {
  syncAuth ??= initializeAuth(getFirebaseApp(), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  });
  const auth = syncAuth;
  if (emulatorsOn() && !authConnected) {
    authConnected = true;
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  }
  return auth;
}

export function getSyncFirestore(): Firestore {
  const firestore = getFirestore(getFirebaseApp());
  if (emulatorsOn() && !firestoreConnected) {
    firestoreConnected = true;
    connectFirestoreEmulator(firestore, EMULATOR_HOST, 8080);
  }
  return firestore;
}

export function getSyncFunctions(): Functions {
  const functions = getFunctions(getFirebaseApp());
  if (emulatorsOn() && !functionsConnected) {
    functionsConnected = true;
    connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  }
  return functions;
}
