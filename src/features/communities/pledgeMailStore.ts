/**
 * The server side of Pledge mail: the day's cap and the once-per-Pledger slot
 * on a Request are reserved, stamped and released through callables (see
 * `pledgeMail.ts` for the sending itself). The recipient is the Request's
 * owner, which the server reads from the Request; the client names no one.
 */
import { callCommunity } from './communityStore';

export interface PledgeMailTarget {
  communityId: string;
  requestId: string;
}

export interface PledgeMailReservation {
  communityName: string;
  /** The Pledger's name as the Community lists it. */
  pledgerName: string;
  requesterName: string;
  /** Where the mail goes: the Request owner's Character, from the server. */
  requesterCharacterId: number;
  /** Request mails left today after this one. */
  remaining: number;
}

/** Claims one of the day's Request mails and this Pledger's slot on the Request; the server holds the cap. */
export function reservePledgeMail(characterId: number, target: PledgeMailTarget) {
  return callCommunity<PledgeMailTarget, PledgeMailReservation>(
    characterId,
    'reserveCommunityPledgeMailCallable',
    target
  );
}

/** The mail went out: stamps it. */
export async function confirmPledgeMail(
  characterId: number,
  target: PledgeMailTarget
): Promise<void> {
  await callCommunity(characterId, 'confirmCommunityPledgeMailCallable', target);
}

/** Gives the reserved slot back after a send ESI refused. */
export async function releasePledgeMail(
  characterId: number,
  target: PledgeMailTarget
): Promise<void> {
  await callCommunity(characterId, 'releaseCommunityPledgeMailCallable', target);
}
