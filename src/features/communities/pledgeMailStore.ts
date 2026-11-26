import { callCommunity } from './communityStore';

export interface PledgeMailTarget {
  communityId: string;
  requestId: string;
}

export interface PledgeMailReservation {
  communityName: string;
  pledgerName: string;
  requesterName: string;
  requesterCharacterId: number;
  remaining: number;
}

export function reservePledgeMail(characterId: number, target: PledgeMailTarget) {
  return callCommunity<PledgeMailTarget, PledgeMailReservation>(
    characterId,
    'reserveCommunityPledgeMailCallable',
    target
  );
}

export async function confirmPledgeMail(
  characterId: number,
  target: PledgeMailTarget
): Promise<void> {
  await callCommunity(characterId, 'confirmCommunityPledgeMailCallable', target);
}

export async function releasePledgeMail(
  characterId: number,
  target: PledgeMailTarget
): Promise<void> {
  await callCommunity(characterId, 'releaseCommunityPledgeMailCallable', target);
}
