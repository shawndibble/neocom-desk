import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

export const emulatorsOn = (): boolean =>
  import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === '1';
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

export function getFirebaseApp(): FirebaseApp {
  const existing = getApps().find((app) => app.name === DEFAULT_APP_NAME);
  return existing ?? initializeApp(firebaseOptions());
}

export function getCharacterApp(characterId: number): FirebaseApp {
  const name = CHARACTER_APP_PREFIX + characterId;
  const existing = getApps().find((app) => app.name === name);
  return existing ?? initializeApp(firebaseOptions(), name);
}

export async function deleteCharacterApp(characterId: number): Promise<void> {
  const name = CHARACTER_APP_PREFIX + characterId;
  const existing = getApps().find((app) => app.name === name);
  if (existing) await deleteApp(existing);
}

export function startedCharacterIds(): number[] {
  return getApps()
    .filter((app) => app.name.startsWith(CHARACTER_APP_PREFIX))
    .map((app) => Number(app.name.slice(CHARACTER_APP_PREFIX.length)));
}
