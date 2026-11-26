import { useEffect, useSyncExternalStore } from 'react';
import { db } from '@/db';
import { countNewRequests } from '@/engine/communities/requests';
import { joinTabElection } from '@/lib/tabLeader';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isOnline, onReconnect } from '@/stores/network';
import { communityBackendOverride } from './backendOverride';
import type { CommunitySummary } from './communityStore';
import { MINUTE_MS } from '@/lib/age';

const watchKey = (characterId: number) => `communityWatch:${characterId}`;
const seenKey = (characterId: number, communityId: string) =>
  `communityRequestsSeen:${characterId}:${communityId}`;

export const REQUEST_BADGE_POLL_MS = 5 * MINUTE_MS;

export async function rememberCommunityWatch(
  characterId: number,
  communities: readonly CommunitySummary[]
): Promise<void> {
  if (communityBackendOverride()) return;
  if (communities.length > 0) await db.settings.put({ key: watchKey(characterId), value: true });
  else await db.settings.delete(watchKey(characterId));
}

export async function isWatchingCommunities(characterId: number): Promise<boolean> {
  return (await db.settings.get(watchKey(characterId)))?.value === true;
}

let counts = new Map<string, number>();
let total = 0;
const listeners = new Set<() => void>();

function publish(next: Map<string, number>) {
  counts = next;
  total = [...next.values()].reduce((sum, n) => sum + n, 0);
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useNewRequestCount = () =>
  useSyncExternalStore(
    subscribe,
    () => total,
    () => 0
  );

let generation = 0;

export function resetRequestBadge() {
  generation += 1;
  publish(new Map());
}

const viewed = new Map<string, number>();

export function watchRequestsViewed(communityId: string): () => void {
  viewed.set(communityId, (viewed.get(communityId) ?? 0) + 1);
  return () => {
    const left = (viewed.get(communityId) ?? 1) - 1;
    if (left <= 0) viewed.delete(communityId);
    else viewed.set(communityId, left);
  };
}

export async function markRequestsSeen(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<void> {
  if (communityBackendOverride()) return;
  await db.settings.put({ key: seenKey(characterId, communityId), value: now });
  if (counts.get(communityId)) publish(new Map(counts).set(communityId, 0));
}

export async function refreshRequestBadge(characterId: number, now = Date.now()): Promise<void> {
  if (communityBackendOverride()) return;
  if (!(await isWatchingCommunities(characterId))) return;
  const [{ getSyncAuth }, { uidForCharacter }, store, requests] = await Promise.all([
    import('@/sync/firebaseApp'),
    import('@/sync/uid'),
    import('./communityStore'),
    import('./requestStore'),
  ]);
  const myUid = uidForCharacter(characterId);
  if (getSyncAuth(characterId).currentUser?.uid !== myUid) return;
  const started = generation;
  const next = await store.withMyCommunities(
    characterId,
    async (communities) => {
      const counted = new Map<string, number>();
      for (const community of communities) {
        if (viewed.has(community.id)) {
          await db.settings.put({ key: seenKey(characterId, community.id), value: now });
          continue;
        }
        const seen = (await db.settings.get(seenKey(characterId, community.id)))?.value;
        if (typeof seen !== 'number') {
          await db.settings.put({ key: seenKey(characterId, community.id), value: now });
          continue;
        }
        const posted = await requests.loadRequestsSince(characterId, community.id, seen);
        const fresh = countNewRequests(posted, myUid, seen, now);
        if (fresh > 0) counted.set(community.id, fresh);
      }
      return counted;
    },
    now
  );
  if (started !== generation) return;
  for (const communityId of viewed.keys()) next.delete(communityId);
  publish(next);
}

export function useRequestBadgePoll() {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    resetRequestBadge();
    if (characterId === null) return;
    const id = characterId;
    const seat = joinTabElection('poller', () => refresh());
    function refresh() {
      if (document.visibilityState !== 'visible' || !seat.isLeader()) return;
      if (!isOnline()) return;
      void refreshRequestBadge(id).catch((err) =>
        console.warn('Request badge could not be refreshed', err)
      );
    }
    refresh();
    const timer = setInterval(refresh, REQUEST_BADGE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const offReconnect = onReconnect(refresh);
    return () => {
      seat.leave();
      offReconnect();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [characterId]);
}
