import { useEffect, useSyncExternalStore } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { isNpcCorporationId } from '@/esi/entityIds';
import { probeSrp, readSrpProbe, subscribeSrpProbe } from './srpNavProbe';

export function useSrpNavVisible(): boolean {
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const corporationId = useActiveCorporationId();
  const eligible =
    characterId !== null && corporationId !== null && !isNpcCorporationId(corporationId);

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
