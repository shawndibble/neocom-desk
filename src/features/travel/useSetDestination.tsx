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
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { setWaypointsInGame } from './sendWaypoints';
import type { ScopeGroup } from '@/esi/registry';
import { WAYPOINT_ENDPOINTS, WAYPOINT_GROUPS, waypointOutcome } from './waypointOutcome';

type SetDestinationOutcome = { tone: 'status' | 'alert'; text: ReactNode } | null;

interface SetDestination {
  /** Why sending can't work yet — no Character, or no waypoint scope — or null when it can. */
  blockedReason: ReactNode;
  /** Sending is blocked only because the browser is offline: the item reads "Needs a connection". */
  offline: boolean;
  /** The Permissions blocking it, for a menu that can't carry a link in its reason; empty otherwise. */
  missingGroups: readonly ScopeGroup[];
  sending: boolean;
  outcome: SetDestinationOutcome;
  /** No-ops while blocked. */
  send: () => void;
}

export function useSetDestination(
  locationId: number,
  placeName: string,
  /** `false` adds the place to the end of the route instead of replacing the route. */
  clearOthers = true
): SetDestination {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const lacksScope = useCharacterLacksEndpoints(characterId, WAYPOINT_ENDPOINTS);
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<SetDestinationOutcome>(null);
  /** `sending` lags a render behind; two quick selects must not both send. */
  const inFlight = useRef(false);

  const blockedReason =
    characterId === null ? (
      t('travel.waypoints.needCharacter')
    ) : lacksScope ? (
      <GrantMissingLink groups={WAYPOINT_GROUPS} />
    ) : !online ? (
      t('common.needsConnection')
    ) : null;

  async function sendFor(id: number) {
    inFlight.current = true;
    setSending(true);
    setOutcome(null);
    try {
      const result = clearOthers
        ? await setWaypointsInGame(id, [locationId])
        : await setWaypointsInGame(id, [locationId], { clearOthers: false });
      setOutcome(waypointOutcome(result, placeName, t, !clearOthers));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return {
    blockedReason,
    offline: characterId !== null && !lacksScope && !online,
    missingGroups: lacksScope && characterId !== null ? WAYPOINT_GROUPS : [],
    sending,
    outcome,
    send: () => {
      if (characterId !== null && blockedReason === null && !inFlight.current) {
        void sendFor(characterId);
      }
    },
  };
}
