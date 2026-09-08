import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

/** Toast shown when the service worker has a new version waiting. */
export function ReloadPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

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
