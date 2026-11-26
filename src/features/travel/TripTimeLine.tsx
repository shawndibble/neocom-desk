import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import type { RouteSafetyTrip } from '@/engine/route/routeSafetyTrip';
import { useTripTime } from '@/features/route/useTripTime';

export function TripTimeLine({ trip }: { trip: RouteSafetyTrip }) {
  const { t } = useTranslation();
  const state = useTripTime(trip);
  if (state.kind === 'loading' || state.kind === 'unavailable') return null;
  if (state.kind === 'no-ship') {
    return <p className="text-xs text-text-dim">{t('travel.tripTime.noShip')}</p>;
  }
  const minutes = (seconds: number) =>
    t('travel.tripTime.minutes', { count: Math.max(1, Math.round(seconds / 60)) });
  const { time } = state;
  return (
    <p className="text-xs text-text-dim">
      <HintText content={t('travel.tripTime.assumption')}>≈</HintText>{' '}
      {t('travel.tripTime.line', {
        warp: minutes(time.warpToZeroSeconds),
        autopilot: minutes(time.autopilotSeconds),
      })}
      {time.partial && <span> {t('travel.tripTime.partial')}</span>}
    </p>
  );
}
