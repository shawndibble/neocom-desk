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
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useSetDestination } from '@/features/travel/useSetDestination';
import { ViewRouteButton } from '@/features/travel/ViewRouteButton';

export function SetDestinationButton({
  locationId,
  placeName,
  routeLink,
}: {
  /** The order's `location_id`: an NPC station, a player structure or a solar system. */
  locationId: number;
  /** Named in the button's accessible name and the confirmation. */
  placeName: string;
  /** Replaces "View route" when the caller has a better way into Route Safety (a jump count). */
  routeLink?: ReactNode;
}) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useSetDestination(locationId, placeName);
  const reasonId = useId();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        // Stays focusable with its reason linked, rather than the native attribute (DESIGN §6c Disabled).
        aria-disabled={blockedReason !== null || undefined}
        aria-describedby={blockedReason !== null ? reasonId : undefined}
        loading={sending}
        aria-label={t('market.orderDetail.setDestinationTo', { placeName })}
        onClick={send}
      >
        {t('market.orderDetail.setDestination')}
      </Button>
      {routeLink ?? <ViewRouteButton locationId={locationId} placeName={placeName} />}
      {blockedReason !== null && (
        <span id={reasonId} className="text-[0.6875rem] text-text-dim">
          {blockedReason}
        </span>
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
