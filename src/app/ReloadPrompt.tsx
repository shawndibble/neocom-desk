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
      className="fixed right-4 bottom-16 z-50 flex items-center gap-3 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-4"
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
