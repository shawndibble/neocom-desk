/**
 * The number on the Communities nav item (issue #3810): open Requests from
 * other Members, posted since this Character last looked at that Community's
 * Requests tab. In-app only, never push: it is read while the app is open, by
 * `useRequestBadgePoll` in the shell, and cleared per Community when its
 * Requests tab is shown (`markRequestsSeen`).
 *
 * Cost is kept off everyone who is in no Community, the way the Community
 * alerts poll does it (`communityAlertEntries.ts`): a Character is only read
 * once the Communities page has listed a Community for it
 * (`rememberCommunityWatch`), and only while the Firebase session is already
 * its own: the poll never mints a token or swaps the session. A Community's
 * first read sets its baseline to now, so Requests that were already on the
 * board are not announced as new.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { db } from '@/db';
import { countNewRequests } from '@/engine/communities/requests';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { communityBackendOverride } from './backendOverride';
import type { CommunitySummary } from './communityStore';

const watchKey = (characterId: number) => `communityWatch:${characterId}`;
const seenKey = (characterId: number, communityId: string) =>
  `communityRequestsSeen:${characterId}:${communityId}`;

/** How often the open app rereads the boards. */
export const REQUEST_BADGE_POLL_MS = 5 * 60_000;

/** Called wherever the Character's Communities are loaded, so the poll knows whether to look. */
export async function rememberCommunityWatch(
  characterId: number,
  communities: readonly CommunitySummary[]
): Promise<void> {
  // A stand-in backend (Storybook) is not this Character's real Communities.
  if (communityBackendOverride()) return;
  if (communities.length > 0) await db.settings.put({ key: watchKey(characterId), value: true });
  else await db.settings.delete(watchKey(characterId));
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

/** The nav badge's number: 0 shows nothing. */
export const useNewRequestCount = () =>
  useSyncExternalStore(
    subscribe,
    () => total,
    () => 0
  );

/** Forgets the count, for a change of active Character. */
export const resetRequestBadge = () => publish(new Map());

/** The pilot is looking at this Community's Requests: nothing in it is new any more. */
export async function markRequestsSeen(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<void> {
  if (communityBackendOverride()) return;
  await db.settings.put({ key: seenKey(characterId, communityId), value: now });
  if (counts.get(communityId)) publish(new Map(counts).set(communityId, 0));
}

/** Rereads every Community's board and republishes the count. Quietly does nothing it cannot do. */
export async function refreshRequestBadge(characterId: number, now = Date.now()): Promise<void> {
  if (communityBackendOverride()) return;
  if ((await db.settings.get(watchKey(characterId)))?.value !== true) return;
  const [{ getSyncAuth }, { uidForCharacter }, store, requests] = await Promise.all([
    import('@/sync/firebaseApp'),
    import('@/sync/uid'),
    import('./communityStore'),
    import('./requestStore'),
  ]);
  const myUid = uidForCharacter(characterId);
  if (getSyncAuth().currentUser?.uid !== myUid) return;
  const next = new Map<string, number>();
  for (const community of await store.loadMyCommunities(characterId)) {
    const seen = (await db.settings.get(seenKey(characterId, community.id)))?.value;
    if (typeof seen !== 'number') {
      await db.settings.put({ key: seenKey(characterId, community.id), value: now });
      continue;
    }
    const board = await requests.loadRequests(characterId, community.id);
    const fresh = countNewRequests(board, myUid, seen, now);
    if (fresh > 0) next.set(community.id, fresh);
  }
  publish(next);
}

/** Mounted once in the shell: reads at start, then on an interval and when the tab is shown again. */
export function useRequestBadgePoll() {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    resetRequestBadge();
    if (characterId === null) return;
    const refresh = () => void refreshRequestBadge(characterId).catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, REQUEST_BADGE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [characterId]);
}
