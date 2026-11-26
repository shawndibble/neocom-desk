import { getValidAccessToken } from '@/auth/session';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';
import { callRouted } from '@/sync/routedCallable';
import { ensureSignedIn } from '@/sync/syncAuth';

export const CLAIM_TOKEN_CAP = 10;

export interface ClaimResult {
  playerId: string;
  characterIds: number[];
  dropped: number[];
}

export async function claimPlayerCharacters(
  characterIds: readonly number[]
): Promise<ClaimResult | null> {
  const live: { characterId: number; accessToken: string }[] = [];
  for (const characterId of characterIds) {
    try {
      live.push({ characterId, accessToken: await getValidAccessToken(characterId) });
    } catch {}
    if (live.length === CLAIM_TOKEN_CAP) break;
  }
  if (live.length < 1) return null;
  const caller = live[0].characterId;
  return underFirebaseSession(async () => {
    await ensureSignedIn(caller);
    return callRouted<{ accessTokens: string[] }, ClaimResult>(
      'claimPlayerCharactersCallable',
      { accessTokens: live.map((l) => l.accessToken) },
      caller
    );
  });
}

export function declineLink(
  characterId: number,
  link: { corporationId: number; minerId: string }
): Promise<void> {
  return underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    await callRouted<typeof link, { declined: true }>(
      'declineCorpTaxBookLinkCallable',
      link,
      characterId
    );
  });
}
