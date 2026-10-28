import { openPublicInfoModal } from '@/stores/publicInfoModal';

/** What a Standings row can open: a faction, an NPC corporation or an NPC agent. */
export type NpcInfoKind = 'faction' | 'corporation' | 'agent';

/**
 * Opens the info modal for a Standings row: the faction view, the Corporation
 * tab of an NPC corporation, or an NPC agent (a character id) card.
 */
export function openNpcInfo(kind: NpcInfoKind, id: number): void {
  openPublicInfoModal(kind === 'agent' ? 'character' : kind, id);
}
