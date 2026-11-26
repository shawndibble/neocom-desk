import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';
import { useViewRoute } from '@/features/route/useViewRoute';

export function ViewRouteMenuItem({ locationId }: { locationId: number }) {
  const { t } = useTranslation();
  const { resolving, failed, view } = useViewRoute(locationId);
  return (
    <MenuItem
      aria-disabled={resolving || undefined}
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
