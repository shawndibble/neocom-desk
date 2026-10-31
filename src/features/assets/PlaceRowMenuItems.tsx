import { MenuItem } from '@/components/ui';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import { writeToClipboard } from '@/lib/clipboard';
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
  copyName,
  pinState,
  onTogglePin,
  t,
}: {
  actions: readonly PlaceMenuAction[];
  placeId: number | null;
  placeName: string;
  /** What "Copy name" copies: the row's own name. */
  copyName: string;
  pinState?: PinState;
  onTogglePin?: () => void;
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
          case 'openInEve':
            return placeId === null ? null : (
              <OpenInEveMenuItem key={action} kind="information" id={placeId} />
            );
          case 'copyName':
            return (
              <MenuItem key={action} onSelect={() => void writeToClipboard(copyName)}>
                {t('assets.menu.copyName')}
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
