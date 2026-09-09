import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

// React StrictMode double-invokes the useState lazy initializer that
// registerSW runs on, so onRegisteredSW can fire twice on first mount in
// dev — guard per registration so only one polling interval ever runs for it.
const pollingRegistrations = new WeakSet<ServiceWorkerRegistration>();

async function checkForUpdate(swUrl: string, registration: ServiceWorkerRegistration) {
  try {
    if (registration.installing || !navigator.onLine) return;
    // Bypass HTTP cache so a stale sw.js (cached by the browser or a proxy)
    // doesn't mask a real update — same pattern vite-plugin-pwa docs
    // recommend for robust periodic checks.
    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: { cache: 'no-store', 'cache-control': 'no-cache' },
    });
    if (resp.ok) await registration.update();
  } catch {
    // Offline/flaky network mid-check — next interval tick retries.
  }
}

/** Toast for a waiting SW update; also polls the registration periodically to trigger update checks. */
export function ReloadPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration || pollingRegistrations.has(registration)) return;
      pollingRegistrations.add(registration);
      setInterval(() => void checkForUpdate(swUrl, registration), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      // Mobile keeps the original bottom-right corner toast, clearing the
      // bottom nav bar. Desktop moves it bottom-center and grows a size and
      // border weight — a corner toast is too easy to miss against a full
      // desktop layout, which is exactly what issue #613 reported. No accent
      // or shadow here: DESIGN.md §6 reserves accent for interactive/selected
      // elements (the Reload button already carries it) and shadows for
      // popovers/menus, so the emphasis comes from layering weight instead.
      className="fixed right-4 bottom-16 z-50 flex items-center gap-3 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:right-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:border-2 md:px-5 md:py-4 md:text-base"
    >
      <span>{t('pwa.updateReady')}</span>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        {t('pwa.reload')}
      </Button>
      <Button size="sm" onClick={() => setNeedRefresh(false)}>
        {t('pwa.dismiss')}
      </Button>
    </div>
  );
}
