/**
 * What the fitting editor says in place of data that never arrived. Two
 * downloads feed it, and each can be missing offline on a first visit: the
 * item catalogue (names, market groups, variations) and the ship data (the
 * ~10 MB dogma engine). A note says which is missing and whether a
 * connection is the cure, with a Retry; both also try again by themselves
 * when the connection returns (`onReconnect`), so Retry is for the lie-fi
 * case where the browser still thinks it is online.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { onReconnect, useOnline } from '@/stores/network';
import { useDogmaEngineStatus } from './dogmaEngineStatus';
import { loadDogmaEngine } from './dogmaFittingEngine';
import { retryFittingCatalogue, useFittingCatalogueFailed } from './useFittingCatalogue';

function retryShipData(): void {
  void loadDogmaEngine().catch(() => {
    // The status the notice reads turns `failed` again; nothing else to do.
  });
}

function Retry({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Button size="sm" onClick={onRetry}>
      {t('fittings.stats.retry')}
    </Button>
  );
}

/**
 * In place of "Loading items…": loading while it loads, an offline-aware
 * failure with Retry once it has not.
 */
export function CatalogueLoadingNote() {
  const { t } = useTranslation();
  const failed = useFittingCatalogueFailed();
  const online = useOnline();
  if (!failed) return <p className="text-xs text-text-dim">{t('fittings.add.loadingCatalogue')}</p>;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-warning">
      <span>{t(online ? 'fittings.add.catalogueFailed' : 'fittings.add.catalogueOffline')}</span>
      <Retry onRetry={retryFittingCatalogue} />
    </div>
  );
}

/**
 * In place of "Ship data is still downloading…": that only while it is
 * downloading. When the download failed it says so, offline-aware, with Retry.
 */
export function ShipDataWaitingNote() {
  const { t } = useTranslation();
  const status = useDogmaEngineStatus();
  const online = useOnline();
  const failed = status === 'failed';
  useEffect(() => (failed ? onReconnect(retryShipData) : undefined), [failed]);
  if (!failed)
    return <p className="text-xs text-warning">{t('fittings.add.waitingForShipData')}</p>;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-warning">
      <span>{t(online ? 'fittings.add.shipDataFailed' : 'fittings.stats.errorOffline')}</span>
      <Retry onRetry={retryShipData} />
    </div>
  );
}
