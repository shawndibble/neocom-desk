/**
 * "View route" for a row menu beside `SetWaypointMenuItem`: opens Route Safety
 * with this place as the destination and the Character's current system as
 * the start. Stays open while it resolves the place's system and reads the
 * reason inline if it can't, as the waypoint item does.
 */
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';
import { useViewRoute } from './useViewRoute';

export function ViewRouteMenuItem({ locationId }: { locationId: number }) {
  const { t } = useTranslation();
  const { resolving, failed, view } = useViewRoute(locationId);
  return (
    <MenuItem
      disabled={resolving}
      onSelect={(event) => {
        event.preventDefault();
        view();
      }}
    >
      {resolving ? (
        t('travel.waypoints.viewRouteResolving')
      ) : failed ? (
        <span role="alert" className="text-danger">
          {t('travel.waypoints.viewRouteUnavailable')}
        </span>
      ) : (
        t('travel.waypoints.viewRoute')
      )}
    </MenuItem>
  );
}
