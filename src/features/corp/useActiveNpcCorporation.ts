/**
 * The active Character's corporation, when it is a known NPC corporation: a pilot there can
 * never hold a Corp Role, so the corp Grant would send them through EVE login for nothing
 * (docs/context/decisions/20261107-000911-a-known-npc-corporation-is-treated-like-none.md). Null for a player corporation, and for one not yet
 * learned, which keeps today's Grant.
 */
import type { Translate } from '@/lib/translate';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCorporationId } from './owner';
import { isPlayerCorporation } from './playerCorporation';

export interface NpcCorporation {
  /** Read, never fetched: whatever already loaded the public info. */
  name: string | null;
}

export function useActiveNpcCorporation(): NpcCorporation | null {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const name = usePublicInfo((state) =>
    activeCharacterId === null
      ? null
      : (state.byCharacterId[activeCharacterId]?.corporationName ?? null)
  );
  if (corporationId === null || isPlayerCorporation(corporationId)) return null;
  return { name };
}

/** "You're in {{corporation}}, an NPC corporation. These pages are for officers…" */
export function npcCorporationText(t: Translate, npc: NpcCorporation): string {
  return npc.name === null
    ? t('corp.npcCorporationUnnamed')
    : t('corp.npcCorporation', { corporation: npc.name });
}
