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
// Third: `features/share/shareStore.ts` writes and reads stored Share Links in
// the public `shares` collection — content a pilot chose to share, carrying no
// uid or Character id (docs/context/decisions/
// 20261002-125432-stored-short-share-links-in-firestore.md).

import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore/lite';
import { getFunctions, type Functions } from 'firebase/functions';
import { getFirebaseApp } from './firebaseCore';

export { getFirebaseApp };

export function getSyncAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getSyncFirestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getSyncFunctions(): Functions {
  return getFunctions(getFirebaseApp());
}
