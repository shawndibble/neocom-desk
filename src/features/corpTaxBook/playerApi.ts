/**
 * A Player's own proofs (ADR: players in two layers). A character proves it
 * belongs to a Player by signing in as itself; the app sends the server only
 * short-lived access tokens, never a refresh token, and the server verifies each
 * (`claimPlayerCharactersCallable`). The added character can also decline an
 * Officer claim (`declineCorpTaxBookLinkCallable`), signed in as itself.
 * Firebase: reach this only through a dynamic import (`app/bootImportGraph.test.ts`).
 */
import { getValidAccessToken } from '@/auth/session';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';
import { callRouted } from '@/sync/routedCallable';
import { ensureSignedIn } from '@/sync/syncAuth';

/** The server's cap on tokens per claim. */
export const CLAIM_TOKEN_CAP = 10;

export interface ClaimResult {
  playerId: string;
  characterIds: number[];
  /** Links dropped because the character's owner hash changed (sold or transferred). */
  dropped: number[];
}

/**
 * Proves the given stored characters as one Player. A character whose login
 * expired is skipped (it counts once it signs in again). Even one live
 * character is claimed (a sold character is dropped server-side only inside a claim
 * for its token); with none live nothing is sent (null).
 */
export async function claimPlayerCharacters(
  characterIds: readonly number[]
): Promise<ClaimResult | null> {
  const live: { characterId: number; accessToken: string }[] = [];
  for (const characterId of characterIds) {
    try {
      live.push({ characterId, accessToken: await getValidAccessToken(characterId) });
    } catch {
      // Login expired or revoked: skipped, not an error.
    }
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

/** The added character says no to an Officer claim in one corporation's book. */
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
