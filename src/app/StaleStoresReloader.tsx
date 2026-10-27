import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { consumeStaleStores } from './staleStoresReload';

const SETTINGS_PATH = /^\/settings(\/|$)/;

/**
 * Reloads once, on the first route change out of Settings, when "Reset view
 * prefs" left the preference stores stale. Settings shows none of those
 * preferences, so reloading there would only hide the confirmation.
 */
export function StaleStoresReloader(): null {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (SETTINGS_PATH.test(pathname)) return;
    if (consumeStaleStores()) window.location.reload();
  }, [pathname]);

  return null;
}
