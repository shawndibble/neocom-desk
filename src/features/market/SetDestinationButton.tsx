/**
 * "Set destination" on an order book row: sends the order's station (or
 * player structure) to the active Character's EVE client as its autopilot
 * destination — one waypoint, clearing the others, the in-game "Set
 * Destination". Route Safety's own button (`travel/SetWaypoints.tsx`) sends a
 * whole trip; this is the one-stop case, through the same ESI call. The row
 * menus' "Set waypoint in game" sends the same way (`useSetDestination`).
 *
 * "View route" sits beside it (`ViewRouteButton`): the same place, opened in
 * Route Safety from the Character's current system.
 *
 * A Character without the waypoint scope, or no Character at all, sees the
 * button disabled with the reason beside it rather than a click that fails.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useSetDestination } from '@/features/travel/useSetDestination';
import { ViewRouteButton } from '@/features/travel/ViewRouteButton';

export function SetDestinationButton({
  locationId,
  placeName,
}: {
  /** The order's `location_id`: an NPC station or a player structure. */
  locationId: number;
  /** Named in the button's accessible name and the confirmation. */
  placeName: string;
}) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useSetDestination(locationId, placeName);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={blockedReason !== null || sending}
        aria-label={t('market.orderDetail.setDestinationTo', { placeName })}
        onClick={send}
      >
        {t('market.orderDetail.setDestination')}
      </Button>
      <ViewRouteButton locationId={locationId} placeName={placeName} />
      {blockedReason !== null && (
        <span className="text-[0.6875rem] text-text-dim">{blockedReason}</span>
      )}
      {outcome && (
        <span
          role={outcome.tone}
          className={outcome.tone === 'alert' ? 'text-xs text-danger' : 'text-xs text-success'}
        >
          {outcome.text}
        </span>
      )}
    </span>
  );
}
