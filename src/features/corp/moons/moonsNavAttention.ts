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
  needsYou: number;
  syncStopped: boolean;
}

const attentionKey = (characterId: number, corporationId: number) =>
  `moonsAttention:${characterId}:${corporationId}`;

export const MOONS_ATTENTION_POLL_MS = 30 * MINUTE_MS;

function readAttention(value: unknown): MoonsAttention | undefined {
  if (!isRecord(value)) return undefined;
  return {
    needsYou: typeof value.needsYou === 'number' ? value.needsYou : 0,
    syncStopped: value.syncStopped === true,
  };
}

export async function publishMoonsAttention(
  characterId: number,
  corporationId: number,
  attention: MoonsAttention | null
): Promise<void> {
  const key = attentionKey(characterId, corporationId);
  if (attention === null) await db.settings.delete(key);
  else await db.settings.put({ key, value: attention });
}

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
  const latest = readAttention((await db.settings.get(key))?.value);
  if (latest === undefined) return;
  const next: MoonsAttention = {
    needsYou: needsYou === null ? 0 : (needsYou ?? latest.needsYou),
    syncStopped: syncStopped ?? latest.syncStopped,
  };
  if (next.needsYou === latest.needsYou && next.syncStopped === latest.syncStopped) return;
  await db.settings.put({ key, value: next });
}

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
    const timer = setInterval(refresh, MOONS_ATTENTION_POLL_MS);
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
