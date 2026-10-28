/** The opened LP store's nearest station and its jump count (issue #5385). Information, not a control. */
import { useTranslation } from 'react-i18next';
import { useNearestStation } from './useNearestStation';

export function NearestStationLine({ corporationId }: { corporationId: number }) {
  const { t } = useTranslation();
  const { loading, station, jumpsStatus } = useNearestStation(corporationId);
  let text: string;
  if (jumpsStatus === 'no-origin') text = t('loyaltyStore.nearestStation.noOrigin');
  else if (station)
    text = t('loyaltyStore.nearestStation.found', {
      station: station.stationName,
      count: station.jumps,
    });
  else if (loading || jumpsStatus === 'loading') text = t('loyaltyStore.nearestStation.loading');
  else text = t('loyaltyStore.nearestStation.noStation');
  return (
    <p data-testid="nearest-station" className="text-xs text-text-dim">
      {text}
    </p>
  );
}
