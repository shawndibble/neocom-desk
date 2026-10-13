/**
 * "View route" to a place: resolves the place's solar system on click, then
 * opens Route Safety there (`routeToHref`), whose start is the Character's
 * current system. Shared by the waypoint menu item and button
 * (`ViewRouteMenuItem`, `ViewRouteButton`) so both fail the same way.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { resolvePlaceSystemId } from './placeSystem';
import { routeToHref } from './routeSafetyLink';

interface ViewRoute {
  resolving: boolean;
  /** The place's system couldn't be found (a structure off the Character's ACL, offline). */
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
        else navigate(routeToHref(systemId, null, preference));
      })
      .finally(() => {
        inFlight.current = false;
        setResolving(false);
      });
  }

  return { resolving, failed, view };
}
