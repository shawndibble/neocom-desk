import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { resolvePlaceSystemId } from './placeSystem';
import { routeToHref } from './routeSafetyLink';

interface ViewRoute {
  resolving: boolean;
  failed: boolean;
  view: () => void;
}

export function useViewRoute(
  locationId: number,
  preference?: RoutePreferenceKind | null
): ViewRoute {
  const navigate = useNavigate();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const [resolving, setResolving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  function view() {
    if (inFlight.current) return;
    inFlight.current = true;
    setResolving(true);
    setFailed(false);
    resolvePlaceSystemId(locationId, characterId)
      .catch(() => null)
      .then((systemId) => {
        if (systemId === null) setFailed(true);
        else
          navigate(
            routeToHref(systemId, null, preference, locationId === systemId ? null : locationId)
          );
      })
      .finally(() => {
        inFlight.current = false;
        setResolving(false);
      });
  }

  return { resolving, failed, view };
}
