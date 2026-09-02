import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import {
  useInstallPromptSeen,
  isIosSafari,
  selectInstallPromptVariant,
  type BeforeInstallPromptEvent,
} from './installPromptRules';

/**
 * One-time install CTA: captures the native `beforeinstallprompt` event on
 * Chromium, or shows a static "Add to Home Screen" banner on iOS Safari
 * where that event never fires. Shown once ever per device — accepting or
 * dismissing either variant permanently suppresses it (CONTEXT.md "Install
 * Prompt", round 20).
 */
export function InstallPrompt() {
  const { t } = useTranslation();
  const { value: seen, hydrated, hydrate, setValue } = useInstallPromptSeen();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!hydrated) return null;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const variant = selectInstallPromptVariant({
    seen,
    isStandalone,
    deferredPromptAvailable: deferredPrompt !== null,
    isIOS: isIosSafari(navigator.userAgent),
  });

  if (variant === 'none') return null;

  const dismiss = () => void setValue(true);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    void setValue(true);
  };

  return (
    <div
      role="alert"
      className="fixed bottom-16 left-4 z-50 flex items-center gap-3 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-4"
    >
      <span>{variant === 'native' ? t('pwa.installCta') : t('pwa.installIosCta')}</span>
      {variant === 'native' && (
        <Button size="sm" variant="primary" onClick={() => void handleInstall()}>
          {t('pwa.install')}
        </Button>
      )}
      <Button size="sm" onClick={dismiss}>
        {t('pwa.dismiss')}
      </Button>
    </div>
  );
}
