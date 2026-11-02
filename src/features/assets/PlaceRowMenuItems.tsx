import { MenuItem } from '@/components/ui';
import { CopyMenuItem } from '@/features/corp/corpRowMenus';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import type { Translate } from '@/lib/translate';
import type { PinState } from './stationPins';
import { nextPinLabelKey, type PlaceMenuAction } from './placeRowMenu';

/**
 * The items of an Assets place row's menu, in the order `placeMenuActions`
 * chose. `placeId` is the station or structure the row is (or sits in).
 */
export function PlaceRowMenuItems({
  actions,
  placeId,
  placeName,
  pinState,
  onTogglePin,
  onRename,
  t,
}: {
  actions: readonly PlaceMenuAction[];
  placeId: number | null;
  placeName: string;
  pinState?: PinState;
  onTogglePin?: () => void;
  onRename?: () => void;
  t: Translate;
}) {
  return (
    <>
      {actions.map((action) => {
        switch (action) {
          case 'setWaypoint':
            return placeId === null ? null : (
              <SetWaypointMenuItem key={action} locationId={placeId} placeName={placeName} />
            );
          case 'addWaypoint':
            return placeId === null ? null : (
              <SetWaypointMenuItem
                key={action}
                locationId={placeId}
                placeName={placeName}
                mode="add"
              />
            );
          case 'openInEve':
            return placeId === null ? null : (
              <OpenInEveMenuItem key={action} kind="information" id={placeId} />
            );
          case 'copyName':
            return (
              <CopyMenuItem key={action} text={placeName}>
                {t('market.contextMenu.copyName')}
              </CopyMenuItem>
            );
          case 'rename':
            return onRename === undefined ? null : (
              <MenuItem key={action} onSelect={onRename}>
                {t('assets.placeNickname.menuRename')}
              </MenuItem>
            );
          case 'togglePin':
            return pinState === undefined || onTogglePin === undefined ? null : (
              <MenuItem key={action} onSelect={onTogglePin}>
                {t(nextPinLabelKey(pinState))}
              </MenuItem>
            );
        }
      })}
    </>
  );
}
