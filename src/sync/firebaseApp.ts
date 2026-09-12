// Lazy Firebase initialization from Vite env. Firebase exists ONLY to sync
// editable data (ADR 0001): no EVE tokens ever flow through it except the
// short-lived access token sent to the mintFirebaseToken callable. One named
// exception: `features/bpcContracts/syncedContracts.ts` reads the shared,
// admin-write-only `publicContractOffers` collection through this same client
// (ADR 0013) — not per-character data, but still nothing an EVE token touches.
// Second named exception: `app/analytics.ts` reads `measurementId` off this
// same app instance to init Firebase Analytics (GA4) — product usage
// telemetry, not sync data (see docs/context/decisions/
// 20260910-113731-add-google-analytics-ga4-via-firebase.md).

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore/lite';
import { getFunctions, type Functions } from 'firebase/functions';

export function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  });
}

export function getSyncAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getSyncFirestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getSyncFunctions(): Functions {
  return getFunctions(getFirebaseApp());
}
