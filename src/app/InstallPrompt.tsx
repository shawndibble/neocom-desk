import { useEffect, useRef } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigationType } from 'react-router-dom';
import { Button } from '@/components/ui';
import {
  useInstallPromptSeen,
  useInstallPromptPageVisits,
  detectInstallPlatform,
  selectInstallPromptVariant,
  INSTALL_PROMPT_MIN_PAGE_VISITS,
  type InstallPromptVariant,
} from './installPromptRules';
import { useInstallApp, promptInstallApp } from './installApp';
import { useOnboardingBannerSlot } from './onboardingBannerSlot';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { isInstalledApp } from '@/lib/installedApp';

const INSTRUCTION_KEYS = {
  'ios-safari': 'pwa.installIosSafariCta',
  'ios-other': 'pwa.installIosOtherCta',
  'android-firefox': 'pwa.installAndroidFirefoxCta',
} as const satisfies Record<Exclude<InstallPromptVariant, 'none' | 'native'>, string>;

function useCountPageVisits() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const { value, setValue } = useInstallPromptPageVisits();
  const hydrated = useHydratedStore(useInstallPromptPageVisits);
  const lastPathname = useRef(pathname);

  useEffect(() => {
    if (!hydrated || pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    if (navigationType === 'REPLACE') return;
    if (value < INSTALL_PROMPT_MIN_PAGE_VISITS) void setValue(value + 1);
  }, [pathname, navigationType, hydrated, value, setValue]);

  return { pageVisits: value, hydrated };
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const { value: seen, setValue } = useInstallPromptSeen();
  const hydrated = useHydratedStore(useInstallPromptSeen);
  const deferredPrompt = useInstallApp((state) => state.deferredPrompt);
  const { pageVisits, hydrated: visitsHydrated } = useCountPageVisits();
  const bannerRef = useRef<HTMLDivElement>(null);

  const variant =
    hydrated && visitsHydrated
      ? selectInstallPromptVariant({
          seen,
          isStandalone: isInstalledApp(),
          deferredPromptAvailable: deferredPrompt !== null,
          platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
          pageVisits,
        })
      : 'none';

  const hasSlot = useOnboardingBannerSlot('install', variant !== 'none');
  const shown = variant !== 'none' && hasSlot;
  useStickyClearance(bannerRef, 'onboarding-banner', { enabled: shown });
  if (!shown) return null;

  const dismiss = () => void setValue(true);

  const handleInstall = async () => {
    await promptInstallApp();
    void setValue(true);
  };

  return (
    <div
      ref={bannerRef}
      role="alert"
      data-testid="onboarding-banner"
      className="motion-rise fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-50 flex items-center gap-3 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-4"
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
