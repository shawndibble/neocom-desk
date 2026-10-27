/**
 * What the fitting editor says in place of data that never arrived. Two
 * downloads feed it, and each can be missing offline on a first visit: the
 * item catalogue (names, market groups, variations) and the ship data (the
 * ~10 MB dogma engine). A note says which is missing and whether a
 * connection is the cure, with a Retry; both also try again by themselves
 * when the connection returns (`onReconnect`), so Retry is for the lie-fi
 * case where the browser still thinks it is online.
 *
 * Each note's wrapper stays mounted through Retry and takes focus at the
 * click (`useRetryFocus`'s `hold`), so focus is never left on `<body>`.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
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
  /** What shows while it is not failed. */
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

/**
 * In place of "Loading items…": loading while it loads, an offline-aware
 * failure with Retry once it has not.
 */
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
      <span className="text-text-dim">{t('fittings.add.loadingCatalogue')}</span>
    </FailedNote>
  );
}

/**
 * In place of "Ship data is still downloading…": that only while it is
 * downloading. When the download failed it says so, offline-aware, with
 * Retry. Idle or ready, there is nothing to wait for: the engine is not
 * what the panel is waiting on, so it stays quiet.
 */
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
