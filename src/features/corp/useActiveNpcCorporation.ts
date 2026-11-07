/**
 * The active Character's corporation when it is a known NPC corporation, whose members can never
 * hold a Corp Role: the corp Grant would unlock nothing (decision 20261107-000911).
 */
import { isNpcCorporationId } from '@/esi/entityIds';
import type { Translate } from '@/lib/translate';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCorporationIdState } from './owner';

export interface NpcCorporation {
  /** Read, never fetched: whatever already loaded the public info. */
  name: string | null;
}

/** `undefined` while the corporation id loads; null for a player corporation or one not yet learned. */
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

/** The line naming the NPC corporation, or its nameless fallback while public info is unloaded. */
export function npcCorporationText(t: Translate, npc: NpcCorporation): string {
  return npc.name === null
    ? t('corp.npcCorporationUnnamed')
    : t('corp.npcCorporation', { corporation: npc.name });
}
