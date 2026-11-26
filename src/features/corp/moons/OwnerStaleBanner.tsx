import { useTranslation } from 'react-i18next';
import { useTimeZone } from '@/lib/timeFormat';
import { ReauthBanner } from '@/components/ui';
import { atDate } from './moonsFormat';

export function OwnerStaleBanner({
  since,
  daysLeft,
  onReconnect,
}: {
  since: number;
  daysLeft: number;
  onReconnect: () => void;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  return (
    <ReauthBanner
      variant="ghost"
      compact
      title={t('corpTaxBook.moons.ownerView.stale.title', {
        date: atDate(since, zone),
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
