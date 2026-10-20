import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import { shortDate } from './moonsFormat';

/**
 * The accounting corporation can't read the moon owner's mining ledger: shown to
 * any officer who visits, with Reconnect (a new grant by an Accountant). Mining
 * since `since` is not counted until it is reconnected.
 */
export function OwnerStaleBanner({
  since,
  onReconnect,
}: {
  since: number;
  onReconnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ReauthBanner
      variant="ghost"
      compact
      title={t('corpTaxBook.moons.ownerView.stale.title', {
        date: shortDate(new Date(since).toISOString()),
      })}
      hint={t('corpTaxBook.moons.ownerView.stale.hint')}
      actionLabel={t('corpTaxBook.moons.ownerView.stale.action')}
      onLogin={onReconnect}
    />
  );
}
