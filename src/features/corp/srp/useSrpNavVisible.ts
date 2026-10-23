import { useEffect, useSyncExternalStore } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { isPlayerCorporation, probeSrp, readSrpProbe, subscribeSrpProbe } from './srpNavProbe';

/**
 * Whether the SRP nav entry shows for a pilot with no Corp Access: their corporation has SRP on
 * (issue #4852). Hidden, never locked, and hidden while unknown. One gate for the rail, the More
 * sheet and the command palette, like `useCorpNavVisible`.
 */
export function useSrpNavVisible(): boolean {
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const corporationId = useActiveCorporationId();
  const eligible =
    characterId !== null && corporationId !== null && isPlayerCorporation(corporationId);

  const cached = useSyncExternalStore(subscribeSrpProbe, () =>
    eligible ? (readSrpProbe(characterId, corporationId, Date.now())?.on ?? null) : null
  );

  useEffect(() => {
    if (!eligible) return;
    if (readSrpProbe(characterId, corporationId, Date.now())?.fresh) return;
    void probeSrp(characterId, corporationId);
  }, [eligible, characterId, corporationId]);

  return cached === true;
}
