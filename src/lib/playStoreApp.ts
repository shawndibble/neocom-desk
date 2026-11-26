export const PLAY_STORE_PACKAGE = 'com.neocomdesk.app';

export const PLAY_STORE_FLAG_KEY = 'playStoreApp';

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

export function detectPlayStoreApp(referrer: string, store: FlagStore): boolean {
  try {
    if (store.getItem(PLAY_STORE_FLAG_KEY) === '1') return true;
  } catch {}
  const fromApp = referrer.startsWith(`android-app://${PLAY_STORE_PACKAGE}`);
  if (fromApp) {
    try {
      store.setItem(PLAY_STORE_FLAG_KEY, '1');
    } catch {}
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
