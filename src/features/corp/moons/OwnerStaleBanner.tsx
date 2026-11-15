import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import { shortDate } from './moonsFormat';

/**
 * The accounting corporation can't read the moon owner's mining ledger: shown to
 * any officer who visits, with Reconnect (a new grant by an Accountant). Mining
 * since `since` is not counted until it is reconnected, and EVE drops it after 30 days:
 * `daysLeft` counts down to that (#6210).
 */
export function OwnerStaleBanner({
  since,
  daysLeft,
  onReconnect,
}: {
  since: number;
  /** Days until the first unread day's ore is lost for good (`daysUntilOreLost`). */
  daysLeft: number;
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
      hint={
        daysLeft > 0
          ? t('corpTaxBook.moons.ownerView.stale.hint', { count: daysLeft })
          : t('corpTaxBook.moons.ownerView.stale.hintLost')
      }
      actionLabel={t('corpTaxBook.moons.ownerView.stale.action')}
      onLogin={onReconnect}
    />
  );
}
