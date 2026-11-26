import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Outcome } from '@/components/OutcomeNote';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { setWaypointsInGame } from './sendWaypoints';
import type { ScopeGroup } from '@/esi/registry';
import { WAYPOINT_ENDPOINTS, WAYPOINT_GROUPS, waypointOutcome } from './waypointOutcome';

interface SetDestination {
  blockedReason: ReactNode;
  offline: boolean;
  missingGroups: readonly ScopeGroup[];
  sending: boolean;
  outcome: Outcome | null;
  send: () => void;
}

export function useSetDestination(
  locationId: number,
  placeName: string,
  clearOthers = true,
  forCharacterId?: number | null
): SetDestination {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const characterId = forCharacterId === undefined ? activeCharacterId : forCharacterId;
  const lacksScope = useCharacterLacksEndpoints(characterId, WAYPOINT_ENDPOINTS);
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
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
