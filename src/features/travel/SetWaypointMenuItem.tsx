/**
 * "Set waypoint in game" for a row menu on any row that names a station,
 * structure or system: sends that place to the active Character's EVE client
 * as its autopilot destination, through the same `useSetDestination` the
 * order book's "Set destination" button uses.
 *
 * The menu stays open while it sends (`preventDefault` on select) and the
 * item itself reads "Setting waypoint…" and then the outcome. There is no
 * toast to report to once the menu closes, and ESI's commonest refusal —
 * the character isn't logged in to the game — must not fail silently.
 * Selecting the outcome sends again.
 *
 * No Character, or one without the waypoint scope, gets the item inert with
 * the reason on tap (`DisabledMenuItem`), as the button shows it beside
 * itself. Written with the kind-agnostic `MenuItem`, so a row's visible
 * "More actions" dropdown gets it too.
 */
import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem } from '@/components/ui';
import { useSetDestination } from './useSetDestination';
import { ViewRouteMenuItem } from './ViewRouteMenuItem';

export function SetWaypointMenuItem({
  locationId,
  placeName,
}: {
  /** An NPC station, player structure or solar system id — never an item id (see `useSetDestination`). */
  locationId: number;
  placeName: string;
}) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useSetDestination(locationId, placeName);
  const label = t('travel.waypoints.menuItem');

  if (blockedReason !== null) {
    return (
      <>
        <DisabledMenuItem reason={blockedReason}>{label}</DisabledMenuItem>
        <ViewRouteMenuItem locationId={locationId} />
      </>
    );
  }
  return (
    <>
      <MenuItem
        disabled={sending}
        onSelect={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {sending ? (
          t('travel.waypoints.menuSending')
        ) : outcome ? (
          <span
            role={outcome.tone}
            className={outcome.tone === 'alert' ? 'text-danger' : 'text-success'}
          >
            {outcome.text}
          </span>
        ) : (
          label
        )}
      </MenuItem>
      <ViewRouteMenuItem locationId={locationId} />
    </>
  );
}
