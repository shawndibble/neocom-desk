/** The opened LP store's nearest station (issue #5385); its jump count opens the route there (#5386). */
import { useTranslation } from 'react-i18next';
import { JumpsLink } from '@/features/route/JumpsLink';
import { useNearestStation } from './useNearestStation';

export function NearestStationLine({ corporationId }: { corporationId: number }) {
  const { t } = useTranslation();
  const { loading, station, jumpsStatus } = useNearestStation(corporationId);
  let text: string;
  if (jumpsStatus === 'no-origin') text = t('loyaltyStore.nearestStation.noOrigin');
  else if (station) text = t('loyaltyStore.nearestStation.found', { station: station.stationName });
  else if (loading || jumpsStatus === 'loading') text = t('loyaltyStore.nearestStation.loading');
  else text = t('loyaltyStore.nearestStation.noStation');
  return (
    <p data-testid="nearest-station" className="text-xs text-text-dim">
      {text}
      {jumpsStatus !== 'no-origin' && station && (
        <JumpsLink systemId={station.systemId} stationId={station.stationId}>
          {t('loyaltyStore.nearestStation.jumps', { count: station.jumps })}
        </JumpsLink>
      )}
    </p>
  );
}
