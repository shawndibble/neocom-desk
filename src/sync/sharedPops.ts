/**
 * The client read seam for Shared Pops (issue #6223, ADR 0034): every moon pop another
 * corporation's Corp Tax Book shares with any of this device's Characters. The server checks each
 * Character's corporation, alliance and Communities live; the pops themselves are never readable
 * from Firestore. The Calendar's "Shared moon pop" kind and the Shared Moon Pop notification read
 * through here. A pop's `id` (`{corporationId}_{extractionId}`) is its deep-link id.
 */
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { SharedPopView } from '../../functions/src/sharedPops';
import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';

export type { SharedPopView };

/**
 * The Shared Pops this device's Characters may read now, soonest Pop Time first. The first
 * Character with a valid token signs the call; the others prove themselves with their access
 * token (used by the server, never stored). A Character whose token cannot refresh is skipped.
 * No Characters, or none with a token: no pops.
 */
export async function fetchSharedPops(): Promise<SharedPopView[]> {
  const characters = await db.characters.toArray();
  const attempts = await Promise.allSettled(
    characters.map(async (c) => ({
      characterId: c.characterId,
      accessToken: await getValidAccessToken(c.characterId),
    }))
  );
  const tokens = attempts.flatMap((a) => (a.status === 'fulfilled' ? [a.value] : []));
  const [signer, ...others] = tokens;
  if (!signer) return [];
  await ensureSignedIn(signer.characterId);
  const result = await callRouted<{ accessTokens: string[] }, { pops?: SharedPopView[] }>(
    'listSharedPopsCallable',
    { accessTokens: others.map((t) => t.accessToken) },
    signer.characterId
  );
  return result.pops ?? [];
}

/** The pop a deep link names, if the viewer still sees it. */
export function findSharedPop(
  pops: readonly SharedPopView[],
  id: string
): SharedPopView | undefined {
  return pops.find((p) => p.id === id);
}
