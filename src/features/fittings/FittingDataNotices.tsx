import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useRetryOnReconnect } from '@/lib/useRetryOnReconnect';
import { useOnline } from '@/stores/network';
import { warmDogmaEngine } from './dogmaFittingEngine';
import { useDogmaEngineStatus } from './useDogmaEngineStatus';
import { retryFittingCatalogue, useFittingCatalogueFailed } from './useFittingCatalogue';

function FailedNote({
  failed,
  message,
  onRetry,
  children,
}: {
  failed: boolean;
  message: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [ref, , hold] = useRetryFocus<HTMLDivElement>(failed ? 'failed' : 'busy', null);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={failed ? 'alert' : undefined}
      className="flex flex-wrap items-center gap-2 text-xs text-warning focus:outline-none"
    >
      {failed ? (
        <>
          <span>{message}</span>
          <Button
            size="sm"
            onClick={() => {
              hold();
              onRetry();
            }}
          >
            {t('common.retry')}
          </Button>
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function CatalogueLoadingNote() {
  const { t } = useTranslation();
  const failed = useFittingCatalogueFailed();
  const online = useOnline();
  return (
    <FailedNote
      failed={failed}
      message={t(online ? 'fittings.add.catalogueFailed' : 'fittings.add.catalogueOffline')}
      onRetry={retryFittingCatalogue}
    >
      <Spinner size="sm" showLabel label={t('fittings.add.loadingCatalogue')} />
    </FailedNote>
  );
}

export function ShipDataWaitingNote() {
  const { t } = useTranslation();
  const status = useDogmaEngineStatus();
  const online = useOnline();
  const failed = status === 'failed';
  useRetryOnReconnect(failed, warmDogmaEngine);
  if (status !== 'loading' && !failed) return null;
  return (
    <FailedNote
      failed={failed}
      message={t(online ? 'fittings.add.shipDataFailed' : 'fittings.stats.errorOffline')}
      onRetry={warmDogmaEngine}
    >
      <span>{t('fittings.add.waitingForShipData')}</span>
    </FailedNote>
  );
}
