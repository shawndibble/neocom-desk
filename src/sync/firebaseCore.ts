// The bare Firebase app instance, importing `firebase/app` and nothing else.
// Split from `firebaseApp.ts` (which re-exports it) so a caller that needs only
// the app — Firebase Analytics in `app/analytics.ts` — loads ~10 KB instead of
// auth + firestore/lite + functions as well. Still Firebase: import it only
// behind `await import(...)` from anything the startup bundle reaches (see the
// code-splitting note in `sync/index.ts`).

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';

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
