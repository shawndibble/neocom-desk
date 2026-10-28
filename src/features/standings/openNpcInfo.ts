import { openPublicInfoModal } from '@/stores/publicInfoModal';

/** What a Standings row can open: a faction, an NPC corporation or an NPC agent. */
export type NpcInfoKind = 'faction' | 'corporation' | 'agent';

/**
 * Opens the info modal for a Standings row. An agent is a character id and a
 * corporation a corporation id, both of which the shared modal already knows;
 * a faction has no modal yet (the modal work adds it and replaces this branch).
 */
export function openNpcInfo(kind: NpcInfoKind, id: number): void {
  if (kind === 'faction') return;
  openPublicInfoModal(kind === 'agent' ? 'character' : 'corporation', id);
}
