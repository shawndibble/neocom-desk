/**
 * "Set destination" on an order book row: sends the order's station (or
 * player structure) to the active Character's EVE client as its autopilot
 * destination — one waypoint, clearing the others, the in-game "Set
 * Destination". Route Safety's own button (`travel/SetWaypoints.tsx`) sends a
 * whole trip; this is the one-stop case, through the same ESI call.
 *
 * A Character without the waypoint scope, or no Character at all, sees the
 * button disabled with the reason beside it rather than a click that fails.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button } from '@/components/ui';
import type { EsiEndpointId } from '@/esi/registry';
import { setWaypointsInGame } from '@/features/travel/sendWaypoints';
import { useActiveCharacter } from '@/stores/activeCharacter';

const ENDPOINTS: readonly EsiEndpointId[] = ['postAutopilotWaypoint'];

type Outcome = { tone: 'status' | 'alert'; text: string } | null;

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
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const lacksScope = useCharacterLacksEndpoints(characterId, ENDPOINTS);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const blockedReason =
    characterId === null
      ? t('travel.waypoints.needCharacter')
      : lacksScope
        ? t('travel.waypoints.permissionReason')
        : null;

  async function send(id: number) {
    setSending(true);
    setOutcome(null);
    try {
      const result = await setWaypointsInGame(id, [locationId]);
      if (result.ok) {
        setOutcome({ tone: 'status', text: t('market.orderDetail.destinationSet', { placeName }) });
      } else {
        const message = result.needsPermission
          ? t('travel.waypoints.needPermission')
          : (result.message ?? t('travel.waypoints.unknownError'));
        setOutcome({ tone: 'alert', text: t('travel.waypoints.failed', { message }) });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={blockedReason !== null || sending}
        aria-label={t('market.orderDetail.setDestinationTo', { placeName })}
        onClick={() => {
          if (characterId !== null) void send(characterId);
        }}
      >
        {t('market.orderDetail.setDestination')}
      </Button>
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
