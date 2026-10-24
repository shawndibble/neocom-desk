/**
 * A guest's answers to a hand-made Miner grouping (D26b, issue #4210).
 *
 * Confirming links a character's lines into someone else's group, so it is
 * proven only by the added character's own EVE sign-in: every confirm here
 * runs under that Character's Firebase session (`ensureSignedIn`), and the
 * server accepts nothing else. A verify token can decline (it only removes a
 * link) but has no way to confirm. Firebase: reach this only from the lazy
 * verify route and the Mining Tax tab (`app/bootImportGraph.test.ts`).
 */
import type { CallableAction } from '../../../functions/src/callableManifest';
import { underFirebaseSession } from '@/features/communities/pledgeWrites';
import { callRouted } from '@/sync/routedCallable';
import { ensureSignedIn } from '@/sync/syncAuth';

/** A grouping waiting for a character: which book, which Miner, and who the main is. */
export interface PendingGrouping {
  corporationId: number;
  minerId: string;
  mainCharacterId: number;
}

const call = <In, Out>(name: CallableAction, data: In): Promise<Out> =>
  callRouted<In, Out>(name, data);

/** The groupings waiting for `characterId`, read as that Character. */
export function listPendingGroupings(characterId: number): Promise<PendingGrouping[]> {
  return underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return call<Record<string, never>, PendingGrouping[]>(
      'listPendingCorpTaxBookGroupingsCallable',
      {}
    );
  });
}

/** Confirms (or declines) a pending grouping as the added character itself. */
export function answerGrouping(
  characterId: number,
  grouping: Pick<PendingGrouping, 'corporationId' | 'minerId'>,
  answer: 'confirm' | 'decline'
): Promise<void> {
  return underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    await call(
      answer === 'confirm'
        ? 'confirmCorpTaxBookGroupingCallable'
        : 'declineCorpTaxBookGroupingCallable',
      { corporationId: grouping.corporationId, minerId: grouping.minerId }
    );
  });
}

/**
 * The verify page's confirm: the page only knows the corporation, so the
 * Character looks up its own pending grouping there first.
 */
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

/** The Miner's verify link declines a pending character. It can never confirm one. */
export function declineByVerifyLink(token: string, characterId: number): Promise<void> {
  return call<{ token: string; characterId: number }, unknown>(
    'declineCorpTaxBookGroupingByTokenCallable',
    { token, characterId }
  ).then(() => undefined);
}
