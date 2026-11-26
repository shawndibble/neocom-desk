import { useTranslation } from 'react-i18next';
import { GrantMissingMenuItem } from '@/app/GrantMissingLink';
import { DisabledMenuItem, MenuItem } from '@/components/ui';
import { useSetDestination } from './useSetDestination';
import { ViewRouteMenuItem } from './ViewRouteMenuItem';

export function SetWaypointMenuItem({
  locationId,
  placeName,
  mode = 'set',
  withViewRoute = true,
}: {
  locationId: number;
  placeName: string;
  mode?: 'set' | 'add';
  withViewRoute?: boolean;
}) {
  const { t } = useTranslation();
  const { blockedReason, offline, missingGroups, sending, outcome, send } = useSetDestination(
    locationId,
    placeName,
    mode === 'set'
  );
  const add = mode === 'add';
  const showViewRoute = !add && withViewRoute;
  const label = t(add ? 'travel.waypoints.addMenuItem' : 'travel.waypoints.menuItem');
  const content = sending ? (
    t(add ? 'travel.waypoints.addMenuSending' : 'travel.waypoints.menuSending')
  ) : outcome ? (
    <span role={outcome.tone} className={outcome.tone === 'alert' ? 'text-danger' : 'text-success'}>
      {outcome.text}
    </span>
  ) : (
    label
  );

  if (blockedReason !== null) {
    return (
      <>
        <DisabledMenuItem
          reason={
            missingGroups.length > 0
              ? t('permissions.grantMissing')
              : offline
                ? t('common.needsConnection')
                : t('travel.waypoints.needCharacter')
          }
        >
          {offline ? content : label}
        </DisabledMenuItem>
        {showViewRoute && <ViewRouteMenuItem locationId={locationId} />}
        {missingGroups.length > 0 && <GrantMissingMenuItem groups={missingGroups} />}
      </>
    );
  }
  return (
    <>
      <MenuItem
        aria-disabled={sending || undefined}
        onSelect={(event) => {
          event.preventDefault();
          if (!sending) send();
        }}
      >
        {content}
      </MenuItem>
      {showViewRoute && <ViewRouteMenuItem locationId={locationId} />}
    </>
  );
}
