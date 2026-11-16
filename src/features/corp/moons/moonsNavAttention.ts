/**
 * The Moons nav dot (#6208): a Corp Tax Book editor sees it on the corp Moons
 * entry while "Needs you" has a card or Automatic sync has stopped, so a due
 * Statement run, an Overdue Miner, an Unmatched donation or a dead schedule
 * reaches them outside the Moons page.
 *
 * The Moons page publishes what it found (`useMoonsAttentionPublisher`) into Dexie, per
 * Character and corporation, and the nav reads that. Only an editor's visit publishes, so the
 * dot never shows for a viewer. While the app is open, a shell poll (`useMoonsAttentionPoll`)
 * recounts for a Character whose editor visit is on record: the schedule's status doc, and the
 * book's Needs you as the Overview counts it (`moonsAttentionCount.ts`), so a declaration,
 * dispute or due Statement run that arrives after the visit lights the dot, and one another
 * officer handled clears it. The scheduled sync's own push alert covers a closed app.
 */
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { scheduledSyncFrom } from '@/engine/corpTaxBook/scheduledSync';
import { isRecord } from '@/engine/guards';
import { MINUTE_MS } from '@/lib/age';
import { joinTabElection } from '@/lib/tabLeader';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isOnline } from '@/stores/network';
import { useActiveCorporationId } from '../owner';

export interface MoonsAttention {
  /** Cards in the book's "Needs you" when the editor last looked. */
  needsYou: number;
  /** Automatic sync has stopped (ADR 0025): the book says why on its health strip. */
  syncStopped: boolean;
}

const attentionKey = (characterId: number, corporationId: number) =>
  `moonsAttention:${characterId}:${corporationId}`;

/** How often the open app recounts. */
export const MOONS_SYNC_POLL_MS = 30 * MINUTE_MS;

function readAttention(value: unknown): MoonsAttention | undefined {
  if (!isRecord(value)) return undefined;
  return {
    needsYou: typeof value.needsYou === 'number' ? value.needsYou : 0,
    syncStopped: value.syncStopped === true,
  };
}

/** Stores what an editor's visit found; `null` (a viewer, or no book) clears it. */
export async function publishMoonsAttention(
  characterId: number,
  corporationId: number,
  attention: MoonsAttention | null
): Promise<void> {
  const key = attentionKey(characterId, corporationId);
  if (attention === null) await db.settings.delete(key);
  else await db.settings.put({ key, value: attention });
}

/** Whether the corp Moons entry wears its dot for the active Character's corporation. */
export function useMoonsNavAttention(): boolean {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  return (
    useLiveQuery(async () => {
      if (characterId === null || corporationId === null) return false;
      const stored = readAttention(
        (await db.settings.get(attentionKey(characterId, corporationId)))?.value
      );
      return stored !== undefined && (stored.needsYou > 0 || stored.syncStopped);
    }, [characterId, corporationId]) ?? false
  );
}

/**
 * Recounts the dot for an editor whose visit is on record: rereads `corps/{id}/meta/scheduledSync`
 * for the stop, and the book for its Needs you count. Never mints a token: only while the Firebase
 * session is already this Character's. A refused or failed read keeps what was stored for it.
 */
export async function refreshMoonsAttention(
  characterId: number,
  corporationId: number
): Promise<void> {
  const key = attentionKey(characterId, corporationId);
  const stored = readAttention((await db.settings.get(key))?.value);
  if (stored === undefined) return;
  const [{ getSyncAuth, getSyncFirestore }, { uidForCharacter }, firestore] = await Promise.all([
    import('@/sync/firebaseApp'),
    import('@/sync/uid'),
    import('firebase/firestore/lite'),
  ]);
  if (getSyncAuth(characterId).currentUser?.uid !== uidForCharacter(characterId)) return;
  const ref = firestore.doc(
    getSyncFirestore(characterId),
    'corps',
    String(corporationId),
    'meta',
    'scheduledSync'
  );
  const [syncStopped, needsYou] = await Promise.all([
    firestore.getDoc(ref).then(
      (snap) => scheduledSyncFrom(snap.data())?.status === 'stopped',
      () => undefined
    ),
    import('./moonsAttentionCount')
      .then(({ loadNeedsYouCount }) => loadNeedsYouCount(characterId, corporationId))
      .catch((err: unknown) => {
        console.warn('Moons Needs you could not be recounted', err);
        return undefined;
      }),
  ]);
  // Re-read: a Moons visit may have published while these reads were in flight.
  const latest = readAttention((await db.settings.get(key))?.value);
  if (latest === undefined) return;
  // No active book any more: nothing needs this editor.
  const next: MoonsAttention = {
    needsYou: needsYou === null ? 0 : (needsYou ?? latest.needsYou),
    syncStopped: syncStopped ?? latest.syncStopped,
  };
  if (next.needsYou === latest.needsYou && next.syncStopped === latest.syncStopped) return;
  await db.settings.put({ key, value: next });
}

/** Mounted once in the shell, like the Communities Request poll: the visible Tab Leader only. */
export function useMoonsAttentionPoll() {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    const seat = joinTabElection('poller', () => refresh());
    function refresh() {
      if (document.visibilityState !== 'visible' || !seat.isLeader() || !isOnline()) return;
      void refreshMoonsAttention(characterId!, corporationId!).catch((err) =>
        console.warn('Moons nav dot could not be refreshed', err)
      );
    }
    refresh();
    const timer = setInterval(refresh, MOONS_SYNC_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      seat.leave();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [characterId, corporationId]);
}
