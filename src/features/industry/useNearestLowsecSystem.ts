import { useEffect, useState } from 'react';
import { nearestLowsecSystem } from '@/engine/industry/reactionLocation';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';

/**
 * The lowsec system nearest the Character (or `fallbackSystemId` when their
 * location is unknown), for the one-tap "move reactions" fix (issue #2908).
 * Looks nothing up while `enabled` is false, and stays `null` when the graph,
 * the system table or the location cannot be read — the fix button is then
 * simply absent.
 */
export function useNearestLowsecSystem(
  characterId: number,
  fallbackSystemId: number | null,
  enabled: boolean
): { id: number; name: string } | null {
  const [found, setFound] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const [graph, systems, current] = await Promise.all([
        loadJumpGraph().catch(() => undefined),
        loadSolarSystemsById().catch(() => null),
        loadCharacterSolarSystemId(characterId).catch(() => null),
      ]);
      if (cancelled || !systems) return;
      const nearest = nearestLowsecSystem(
        graph,
        current,
        fallbackSystemId,
        (id) => systems.get(id)?.security
      );
      const name = nearest ? systems.get(nearest.systemId)?.name : undefined;
      setFound(nearest && name ? { id: nearest.systemId, name } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, fallbackSystemId, enabled]);

  return enabled ? found : null;
}
