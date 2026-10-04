/**
 * Sends one place — an NPC station, a player structure or a solar system — to
 * the active Character's EVE client as its autopilot destination: one
 * waypoint, clearing the others, the in-game "Set Destination". Shared by the
 * order book's "Set destination" button (`market/SetDestinationButton.tsx`)
 * and the row menus' "Set waypoint in game" (`SetWaypointMenuItem.tsx`), so
 * the two can't drift in who may send or what the outcome says.
 *
 * `locationId` must already be a place. An asset's or a blueprint's raw
 * `location_id` can be a container, ship or hangar item id, which ESI
 * refuses; those callers resolve it to its station first.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import type { EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { setWaypointsInGame } from './sendWaypoints';

const ENDPOINTS: readonly EsiEndpointId[] = ['postAutopilotWaypoint'];

export type SetDestinationOutcome = { tone: 'status' | 'alert'; text: string } | null;

export interface SetDestination {
  /** Why sending can't work yet — no Character, or no waypoint scope — or null when it can. */
  blockedReason: string | null;
  sending: boolean;
  outcome: SetDestinationOutcome;
  /** No-ops while blocked. */
  send: () => void;
}

export function useSetDestination(locationId: number, placeName: string): SetDestination {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const lacksScope = useCharacterLacksEndpoints(characterId, ENDPOINTS);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<SetDestinationOutcome>(null);

  const blockedReason =
    characterId === null
      ? t('travel.waypoints.needCharacter')
      : lacksScope
        ? t('travel.waypoints.permissionReason')
        : null;

  async function sendFor(id: number) {
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

  return {
    blockedReason,
    sending,
    outcome,
    send: () => {
      if (characterId !== null && blockedReason === null && !sending) void sendFor(characterId);
    },
  };
}
