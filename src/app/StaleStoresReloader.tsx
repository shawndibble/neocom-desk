import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { consumeStaleStores } from './staleStoresReload';

const SETTINGS_PATH = /^\/settings(\/|$)/;

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
