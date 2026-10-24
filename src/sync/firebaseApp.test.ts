// The dev-only emulator switch (issue #4190): off by default, never in a
// production build, and each connector is called at most once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connectAuthEmulator = vi.fn();
const connectFirestoreEmulator = vi.fn();
const connectFunctionsEmulator = vi.fn();
const initializeAuth = vi.fn<(app: unknown, deps: unknown) => { kind: string }>(() => ({
  kind: 'auth',
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: (app: unknown, deps: unknown) => initializeAuth(app, deps),
  indexedDBLocalPersistence: 'indexedDB',
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
  connectAuthEmulator: (...args: unknown[]) => connectAuthEmulator(...args),
}));
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: vi.fn(() => ({ kind: 'firestore' })),
  connectFirestoreEmulator: (...args: unknown[]) => connectFirestoreEmulator(...args),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({ kind: 'functions' })),
  connectFunctionsEmulator: (...args: unknown[]) => connectFunctionsEmulator(...args),
}));
vi.mock('./firebaseCore', async (importActual) => ({
  ...(await importActual<typeof import('./firebaseCore')>()),
  getFirebaseApp: vi.fn(() => ({ name: 'app' })),
}));

async function load() {
  vi.resetModules();
  return import('./firebaseApp');
}

function touchAll(mod: Awaited<ReturnType<typeof load>>) {
  mod.getSyncAuth();
  mod.getSyncFirestore();
  mod.getSyncFunctions();
}

describe('firebaseApp emulator switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('connects nothing when the flag is unset', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_FIREBASE_EMULATORS', '');
    touchAll(await load());
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it('never connects in a production build, even with the flag set', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_FIREBASE_EMULATORS', '1');
    touchAll(await load());
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it('connects each service once to the local emulator in dev with the flag on', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_FIREBASE_EMULATORS', '1');
    const mod = await load();
    touchAll(mod);
    touchAll(mod);
    expect(connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(connectAuthEmulator).toHaveBeenCalledWith({ kind: 'auth' }, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    expect(connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({ kind: 'firestore' }, '127.0.0.1', 8080);
    expect(connectFunctionsEmulator).toHaveBeenCalledTimes(1);
    expect(connectFunctionsEmulator).toHaveBeenCalledWith({ kind: 'functions' }, '127.0.0.1', 5001);
  });

  // `getAuth` passes `browserPopupRedirectResolver`, which loads Google's gapi
  // iframe (apis.google.com, third-party cookies) the moment Auth starts. The
  // app signs in only with custom tokens, so it never needs a popup or redirect.
  it('initializes Auth once, without a popup/redirect resolver, keeping getAuth persistence', async () => {
    vi.stubEnv('DEV', false);
    const mod = await load();
    mod.getSyncAuth();
    mod.getSyncAuth();
    expect(initializeAuth).toHaveBeenCalledTimes(1);
    expect(initializeAuth).toHaveBeenCalledWith(
      { name: 'app' },
      { persistence: ['indexedDB', 'local', 'session'] }
    );
  });
});
