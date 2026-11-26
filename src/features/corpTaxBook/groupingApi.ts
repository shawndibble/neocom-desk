import type { CallableAction } from '../../../functions/src/callableManifest';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';
import { callRouted } from '@/sync/routedCallable';
import { ensureSignedIn } from '@/sync/syncAuth';

export interface PendingGrouping {
  corporationId: number;
  minerId: string;
  mainCharacterId: number;
}

const call = <In, Out>(
  characterId: number | undefined,
  name: CallableAction,
  data: In
): Promise<Out> => callRouted<In, Out>(name, data, characterId);

export function listPendingGroupings(characterId: number): Promise<PendingGrouping[]> {
  return underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return call<Record<string, never>, PendingGrouping[]>(
      characterId,
      'listPendingCorpTaxBookGroupingsCallable',
      {}
    );
  });
}

export function answerGrouping(
  characterId: number,
  grouping: Pick<PendingGrouping, 'corporationId' | 'minerId'>,
  answer: 'confirm' | 'decline'
): Promise<void> {
  return underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    await call(
      characterId,
      answer === 'confirm'
        ? 'confirmCorpTaxBookGroupingCallable'
        : 'declineCorpTaxBookGroupingCallable',
      { corporationId: grouping.corporationId, minerId: grouping.minerId }
    );
  });
}

export async function confirmPendingInCorporation(
  characterId: number,
  corporationId: number
): Promise<void> {
  const pending = (await listPendingGroupings(characterId)).filter(
    (g) => g.corporationId === corporationId
  );
  if (pending.length === 0)
    throw Object.assign(new Error('Nothing to confirm'), { code: 'not-found' });
  for (const grouping of pending) await answerGrouping(characterId, grouping, 'confirm');
}

export function declineByVerifyLink(token: string, characterId: number): Promise<void> {
  return call<{ token: string; characterId: number }, unknown>(
    undefined,
    'declineCorpTaxBookGroupingByTokenCallable',
    { token, characterId }
  ).then(() => undefined);
}
