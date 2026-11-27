import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { SharedPopView } from '../../functions/src/sharedPops';
import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';

const MAX_OTHER_CHARACTERS = 50;

export type { SharedPopView };

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
    { accessTokens: others.slice(0, MAX_OTHER_CHARACTERS).map((t) => t.accessToken) },
    signer.characterId
  );
  return result.pops ?? [];
}

export async function linkSharedPopSurvey(
  popId: string,
  surveyId: string,
  options: { onlyIfUnlinked?: boolean; characterId?: number } = {}
): Promise<void> {
  const characterId = options.characterId ?? (await db.characters.toArray())[0]?.characterId;
  if (characterId === undefined) return;
  await ensureSignedIn(characterId);
  await callRouted<{ popId: string; surveyId: string; onlyIfUnlinked: boolean }, { linked: true }>(
    'linkSharedPopSurveyCallable',
    { popId, surveyId, onlyIfUnlinked: options.onlyIfUnlinked === true },
    characterId
  );
}

export function findSharedPop(
  pops: readonly SharedPopView[],
  id: string
): SharedPopView | undefined {
  return pops.find((p) => p.id === id);
}
