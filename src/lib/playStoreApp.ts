/** Application id of the Bubblewrap-built Trusted Web Activity; matches public/.well-known/assetlinks.json. */
export const PLAY_STORE_PACKAGE = 'com.neocomdesk.app';

const STORAGE_KEY = 'playStoreApp';

interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A Trusted Web Activity launch reports `android-app://<package>` as the
 * document referrer; a Chrome-installed PWA or a browser tab does not, and
 * `display-mode: standalone` can't tell them apart. The referrer only exists
 * on the first load, so a positive is kept in session storage (per-tab, so it
 * never leaks into a browser tab sharing Chrome's origin storage).
 */
export function detectPlayStoreApp(referrer: string, store: FlagStore): boolean {
  try {
    if (store.getItem(STORAGE_KEY) === '1') return true;
  } catch {
    // storage blocked: fall through to the referrer alone
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
