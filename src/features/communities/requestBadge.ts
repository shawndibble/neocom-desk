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
import { joinTabElection } from '@/lib/tabLeader';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isOnline, onReconnect } from '@/stores/network';
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

/** Whether the Communities page has listed a Community for this Character (`rememberCommunityWatch`). */
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

/** The nav badge's number: 0 shows nothing. */
export const useNewRequestCount = () =>
  useSyncExternalStore(
    subscribe,
    () => total,
    () => 0
  );

/**
 * Counts the resets: a refresh that began before a change of Character must
 * not publish that Character's count over the new one.
 */
let generation = 0;

/** Forgets the count, for a change of active Character. */
export function resetRequestBadge() {
  generation += 1;
  publish(new Map());
}

/** Communities whose Requests tab is on screen right now: what arrives there is seen, not new. */
const viewed = new Map<string, number>();

/** The Requests tab of a Community is shown until the returned function is called. */
export function watchRequestsViewed(communityId: string): () => void {
  viewed.set(communityId, (viewed.get(communityId) ?? 0) + 1);
  return () => {
    const left = (viewed.get(communityId) ?? 1) - 1;
    if (left <= 0) viewed.delete(communityId);
    else viewed.set(communityId, left);
  };
}

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

/** Rereads every Community's board and republishes the count. Does nothing it cannot do. */
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
          // Being looked at: Requests that arrive now are seen, not new.
          await db.settings.put({ key: seenKey(characterId, community.id), value: now });
          continue;
        }
        const seen = (await db.settings.get(seenKey(characterId, community.id)))?.value;
        if (typeof seen !== 'number') {
          await db.settings.put({ key: seenKey(characterId, community.id), value: now });
          continue;
        }
        // Only what was posted since: an idle tick is one read per Community, not its whole board.
        const posted = await requests.loadRequestsSince(characterId, community.id, seen);
        const fresh = countNewRequests(posted, myUid, seen, now);
        if (fresh > 0) counted.set(community.id, fresh);
      }
      return counted;
    },
    now
  );
  // The Character changed while this read was in flight: its count is not the new one's.
  if (started !== generation) return;
  // A tab opened during the read marked its Community seen: that count is not new either.
  for (const communityId of viewed.keys()) next.delete(communityId);
  publish(next);
}

/**
 * Mounted once in the shell: reads at start, then on an interval and when the tab is shown again.
 * Only the visible Tab Leader reads (the Foreground Poller's election, `lib/tabLeader.ts`): a
 * hidden tab, or a second visible window, keeps the count it last had instead of paying for its
 * own reads. A tab that becomes leader reads at once.
 */
export function useRequestBadgePoll() {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    resetRequestBadge();
    if (characterId === null) return;
    const id = characterId;
    const seat = joinTabElection('poller', () => refresh());
    function refresh() {
      if (document.visibilityState !== 'visible' || !seat.isLeader()) return;
      // Every board read is a Firebase round trip that cannot succeed offline.
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
