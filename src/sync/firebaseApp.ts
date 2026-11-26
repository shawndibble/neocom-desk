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

const EMULATOR_HOST = '127.0.0.1';
const authInstances = new Map<number, Auth>();
const firestoreConnected = new Set<number>();
const functionsConnected = new Set<number | undefined>();
let legacyAuth: Auth | undefined;

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

export function getSyncFirestore(characterId: number): Firestore {
  const firestore = getFirestore(getCharacterApp(characterId));
  if (emulatorsOn() && !firestoreConnected.has(characterId)) {
    firestoreConnected.add(characterId);
    connectFirestoreEmulator(firestore, EMULATOR_HOST, 8080);
  }
  return firestore;
}

export function getLegacySyncAuth(): Auth {
  legacyAuth ??= initializeAuth(getFirebaseApp(), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  });
  return legacyAuth;
}

export async function disposeCharacterApp(characterId: number): Promise<void> {
  authInstances.delete(characterId);
  firestoreConnected.delete(characterId);
  functionsConnected.delete(characterId);
  await deleteCharacterApp(characterId);
}

export function getSyncFunctions(characterId?: number): Functions {
  const functions = getFunctions(
    characterId === undefined ? getFirebaseApp() : getCharacterApp(characterId)
  );
  if (emulatorsOn() && !functionsConnected.has(characterId)) {
    functionsConnected.add(characterId);
    connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  }
  return functions;
}
