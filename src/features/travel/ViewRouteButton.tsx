/**
 * "View route" beside a "Set destination" button: same destination, opened in
 * Route Safety from the Character's current system.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useViewRoute } from './useViewRoute';

export function ViewRouteButton({
  locationId,
  placeName,
}: {
  locationId: number;
  placeName: string;
}) {
  const { t } = useTranslation();
  const { resolving, failed, view } = useViewRoute(locationId);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={resolving}
        aria-label={t('travel.waypoints.viewRouteTo', { placeName })}
        onClick={view}
      >
        {t('travel.waypoints.viewRoute')}
      </Button>
      {failed && (
        <span role="alert" className="text-xs text-danger">
          {t('travel.waypoints.viewRouteUnavailable')}
        </span>
      )}
    </span>
  );
}
