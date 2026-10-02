import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import {
  useInstallPromptSeen,
  detectInstallPlatform,
  selectInstallPromptVariant,
  type InstallPromptVariant,
  type BeforeInstallPromptEvent,
} from './installPromptRules';
import { useOnboardingBannerSlot } from './onboardingBannerSlot';

const INSTRUCTION_KEYS = {
  'ios-safari': 'pwa.installIosSafariCta',
  'ios-other': 'pwa.installIosOtherCta',
  'android-firefox': 'pwa.installAndroidFirefoxCta',
} as const satisfies Record<Exclude<InstallPromptVariant, 'none' | 'native'>, string>;

/**
 * One-time, phones-and-tablets-only install CTA: uses the native
 * `beforeinstallprompt` event where Android Chromium fires it, otherwise
 * shows instructions for this browser's own menu on iOS and Firefox for
 * Android, which never fire the event. Shown once ever per device —
 * accepting or dismissing either variant permanently suppresses it
 * (CONTEXT.md "Install Prompt"; decision 20261002-165619).
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

  const variant = hydrated
    ? selectInstallPromptVariant({
        seen,
        isStandalone:
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as { standalone?: boolean }).standalone === true,
        deferredPromptAvailable: deferredPrompt !== null,
        platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
      })
    : 'none';

  // Eligibility above is unchanged; this only decides whether the shared
  // bottom slot is this banner's to use right now (issue #1124).
  const hasSlot = useOnboardingBannerSlot('install', variant !== 'none');
  // Both, not just the slot: registration happens in an effect, so the store
  // still says "eligible" for the one commit after a dismissal flips
  // `variant` back to 'none'.
  if (variant === 'none' || !hasSlot) return null;

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
      data-testid="onboarding-banner"
      className="fixed bottom-16 left-4 z-50 flex items-center gap-3 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-4"
    >
      <span>{variant === 'native' ? t('pwa.installCta') : t(INSTRUCTION_KEYS[variant])}</span>
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
