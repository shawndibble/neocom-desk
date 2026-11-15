/**
 * The Moons nav dot (#6208): a Corp Tax Book editor sees it on the corp Moons
 * entry while "Needs you" has a card or Automatic sync has stopped, so a due
 * Statement run, an Overdue Miner, an Unmatched donation or a dead schedule
 * reaches them outside the Moons page.
 *
 * The book is far too heavy to load in the shell, so the Moons page publishes
 * what it found (`useMoonsAttentionPublisher`) into Dexie, per Character and
 * corporation, and the nav reads that. Only an editor's visit publishes, so the
 * dot never shows for a viewer. A stop the server records after that visit is
 * picked up by a light shell poll of the one status doc
 * (`useMoonsSyncStoppedPoll`), and only for a Character whose editor visit is
 * on record; the scheduled sync's own push alert covers a closed app.
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

/** How often the open app rereads the schedule's status doc. */
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
 * Rereads `corps/{id}/meta/scheduledSync` for an editor whose visit is on record, and updates
 * the stop. Never mints a token: only while the Firebase session is already this Character's,
 * and a refused read (an expired officer record) keeps what the last visit found.
 */
export async function refreshMoonsSyncStopped(
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
  let syncStopped: boolean;
  try {
    syncStopped = scheduledSyncFrom((await firestore.getDoc(ref)).data())?.status === 'stopped';
  } catch {
    return;
  }
  if (syncStopped === stored.syncStopped) return;
  // Re-read: a Moons visit may have published while this read was in flight.
  const latest = readAttention((await db.settings.get(key))?.value);
  if (latest === undefined) return;
  await db.settings.put({ key, value: { ...latest, syncStopped } });
}

/** Mounted once in the shell, like the Communities Request poll: the visible Tab Leader only. */
export function useMoonsSyncStoppedPoll() {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    const seat = joinTabElection('poller', () => refresh());
    function refresh() {
      if (document.visibilityState !== 'visible' || !seat.isLeader() || !isOnline()) return;
      void refreshMoonsSyncStopped(characterId!, corporationId!).catch((err) =>
        console.warn('Moons sync status could not be refreshed', err)
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
