import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast } from '@/components/ui';
import { isTypingTarget } from '@/lib/shortcuts';
import { routePaste } from './pasteRouting';

export function GlobalPasteRouter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(null);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });
  const latestPaste = useRef(0);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
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
