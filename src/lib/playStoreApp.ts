/** Application id of the Bubblewrap-built Trusted Web Activity; matches public/.well-known/assetlinks.json. */
export const PLAY_STORE_PACKAGE = 'com.neocomdesk.app';

const STORAGE_KEY = 'playStoreApp';

interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A TWA launch sets the referrer to android-app://<package>; see docs/ANDROID-TWA.md. */
export function detectPlayStoreApp(referrer: string, store: FlagStore): boolean {
  try {
    if (store.getItem(STORAGE_KEY) === '1') return true;
  } catch {
    // blocked storage: rely on the referrer alone
  }
  const fromApp = referrer.startsWith(`android-app://${PLAY_STORE_PACKAGE}`);
  if (fromApp) {
    try {
      store.setItem(STORAGE_KEY, '1');
    } catch {
      // best effort
    }
  }
  return fromApp;
}

export function isPlayStoreApp(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return detectPlayStoreApp(document.referrer, window.sessionStorage);
  } catch {
    return detectPlayStoreApp(document.referrer, { getItem: () => null, setItem: () => {} });
  }
}
