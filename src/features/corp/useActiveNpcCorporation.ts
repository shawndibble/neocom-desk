import { isNpcCorporationId } from '@/esi/entityIds';
import type { Translate } from '@/lib/translate';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCorporationIdState } from './owner';

export interface NpcCorporation {
  name: string | null;
}

export function useActiveNpcCorporation(): NpcCorporation | null | undefined {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationIdState();
  const name = usePublicInfo((state) =>
    activeCharacterId === null
      ? null
      : (state.byCharacterId[activeCharacterId]?.corporationName ?? null)
  );
  if (corporationId === undefined) return undefined;
  if (corporationId === null || !isNpcCorporationId(corporationId)) return null;
  return { name };
}

export function npcCorporationText(
  t: Translate,
  npc: NpcCorporation,
  key = 'corp.npcCorporation'
): string {
  return npc.name === null ? t(`${key}Unnamed`) : t(key, { corporation: npc.name });
}
