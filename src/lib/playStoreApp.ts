/** Application id of the Bubblewrap-built Trusted Web Activity; matches public/.well-known/assetlinks.json. */
export const PLAY_STORE_PACKAGE = 'com.neocomdesk.app';

const STORAGE_KEY = 'playStoreApp';

/**
 * Chrome won't open Android's settings screens from a page, so the shell ships
 * its own BROWSABLE activity that does (scripts/twa/NotificationSettingsActivity.java).
 * A shell without it (version code 2 and older) takes Chrome to the fallback,
 * i.e. back to the page the tap came from.
 */
export function androidNotificationSettingsUrl(fallbackUrl: string): string {
  return (
    'intent://notification-settings#Intent;scheme=neocomdesk;' +
    `package=${PLAY_STORE_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
  );
}

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
