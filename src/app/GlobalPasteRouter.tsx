import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast } from '@/components/ui';
import { isTypingTarget } from '@/lib/shortcuts';
import { routePaste } from './pasteRouting';

/**
 * The app-wide paste router: Ctrl+V / Cmd+V anywhere on a page — not into a
 * field — with an EFT fit or an item list on the clipboard opens it in
 * Fittings or the Appraisal straight away. No confirm step: a mistaken paste
 * is one Back away, and every page keeps its own state across the trip.
 *
 * Mounted once from `Layout`. Steps aside only for a paste into a field (a
 * dialog's own import box handles its own paste); an open dialog, drawer or
 * menu does not block it.
 */
export function GlobalPasteRouter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Said when a paste that may have been a list could not be read for want of data.
  const [notice, setNotice] = useState<string | null>(null);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });
  // Only the latest paste may navigate, whichever classifies first.
  const latestPaste = useRef(0);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      // Only where the paste lands: a dialog's own import box is a field.
      if (isTypingTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.trim() === '') return;

      const id = ++latestPaste.current;
      void routePaste(text, locationRef.current).then(({ route, unreadable }) => {
        if (id !== latestPaste.current) return;
        if (route !== null) void navigate(...route);
        else if (unreadable) setNotice(t('shortcuts.pasteOffline'));
      });
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [navigate, t]);

  return notice === null ? null : <Toast message={notice} onClose={() => setNotice(null)} />;
}
