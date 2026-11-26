import { openPublicInfoModal } from '@/stores/publicInfoModal';

export type NpcInfoKind = 'faction' | 'corporation' | 'agent';

export function openNpcInfo(kind: NpcInfoKind, id: number): void {
  openPublicInfoModal(kind === 'agent' ? 'character' : kind, id);
}
