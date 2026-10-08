import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { promptInstallApp, useInstallApp } from '@/app/installApp';
import { detectInstallPlatform, selectInstallAppVariant } from '@/app/installPromptRules';

const STEPS_KEYS = {
  'ios-safari': 'pwa.installIosSafariCta',
  'ios-other': 'pwa.installIosOtherCta',
  'android-firefox': 'pwa.installAndroidFirefoxCta',
  menu: 'settings.installMenuSteps',
  installed: 'settings.installInstalled',
} as const;

/**
 * Settings → Data & storage → Install this app (phones and tablets only). The later path for the
 * one-time install banner: ignores `installPrompt.seen`, so a dismissed banner
 * is never the end of it.
 */
export function InstallAppPanel() {
  const { t } = useTranslation();
  const deferredPrompt = useInstallApp((s) => s.deferredPrompt);
  const variant = selectInstallAppVariant({
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    deferredPromptAvailable: deferredPrompt !== null,
    platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  });

  if (variant === 'none') return null;

  return (
    <Panel title={t('settings.installTitle')} data-testid="install-app-panel">
      <div className="space-y-1.5">
        <p className="max-w-2xl text-xs text-text-dim">
          {variant === 'native' ? t('settings.installHint') : t(STEPS_KEYS[variant])}
        </p>
        {variant === 'native' && (
          <Button size="sm" onClick={() => void promptInstallApp()}>
            {t('pwa.install')}
          </Button>
        )}
      </div>
    </Panel>
  );
}
