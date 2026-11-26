import { useEffect, useState } from 'react';
import { nearestLowsecSystem } from '@/engine/industry/reactionLocation';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';

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
