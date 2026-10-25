/**
 * What the Community alerts poll reads for one Character: the waiting list and
 * the roster of every Community it administers, and the Pledges other Members
 * made on its own open Requests (`engine/communities/communityAlert.ts` diffs
 * two reads).
 *
 * Cost is kept off everyone who never runs a Community. A Character is only
 * read once the Communities page has seen it administer one (`rememberCommunityAdmin`),
 * and only while the Firebase session is already its own: the poll never mints
 * a token. A Character it cannot read right now returns null, so the
 * poll skips rather than writing a baseline that would make the next good poll
 * look like a burst of arrivals.
 *
 * The roster is the expensive read (a document per Member), so it is refetched
 * only when the Community's Member count moves.
 *
 * Pledges are read only for a Character the Communities page has listed a
 * Community for (`rememberCommunityWatch`, the same flag the Requests badge
 * uses), and per Community only when one of its own open Requests asked for
 * the app: the Character's own Requests are queried by `ownerUid`, then the
 * Pledges of each of those (never the whole board). A
 * Pledger's name is read from the roster only when a Pledger has not been seen
 * before; without it the alert says "A Member".
 */
import { db } from '@/db';
import type { CommunityAlertEntry } from '@/engine/communities/communityAlert';
import { isOpenRequest } from '@/engine/communities/requests';
import { communityBackendOverride } from './backendOverride';
import { isCommunityAdmin, type CommunitySummary } from './communityStore';
import { isWatchingCommunities } from './requestBadge';

const adminKey = (characterId: number) => `communityAdmin:${characterId}`;

/** Called wherever the Character's Communities are loaded, so the poll knows whether to look. */
export async function rememberCommunityAdmin(
  characterId: number,
  communities: readonly CommunitySummary[]
): Promise<void> {
  // A stand-in backend (Storybook) is not this Character's real Communities.
  if (communityBackendOverride()) return;
  const admin = communities.some((community) => isCommunityAdmin(community, characterId));
  if (admin) await db.settings.put({ key: adminKey(characterId), value: true });
  else await db.settings.delete(adminKey(characterId));
}

const rosters = new Map<string, { count: number; entries: CommunityAlertEntry[] }>();

/** Pledger names by Community, kept for the session: the roster is only read for a Pledger not seen yet. */
const pledgerNames = new Map<string, Map<string, string>>();

async function loadPledgeEntries(
  characterId: number,
  myUid: string,
  community: CommunitySummary,
  store: typeof import('./communityStore'),
  requests: typeof import('./requestStore')
): Promise<CommunityAlertEntry[]> {
  const now = Date.now();
  // A standing Request takes quotes, not Pledges, so it never raises a Pledge alert.
  // Only the Character's own Requests are read (one query on ownerUid), then the
  // Pledges on each of them: what is pledged to this Character, not every Pledge in
  // the Community.
  const mine = (await requests.loadMyRequests(characterId, community.id)).filter(
    (request) => request.notify.app && !request.standing && isOpenRequest(request, now)
  );
  if (mine.length === 0) return [];
  const base = { communityId: community.id, communityName: community.name };
  const pledgesOf = await Promise.all(
    mine.map(async (request) => ({
      request,
      pledges: (await requests.loadPledges(characterId, community.id, request.id)).filter(
        (pledge) => pledge.uid !== myUid
      ),
    }))
  );
  const names = pledgerNames.get(community.id) ?? new Map<string, string>();
  pledgerNames.set(community.id, names);
  const unseen = pledgesOf.flatMap(({ pledges }) => pledges).filter((p) => !names.has(p.uid));
  if (unseen.length > 0) {
    try {
      const roster = await store.loadCommunityMembers(characterId, community.id);
      for (const member of roster) names.set(member.uid, member.characterName);
      // Not on the roster (the Pledger left): remembered as unknown, so it is not read for again.
      for (const pledge of unseen) if (!names.has(pledge.uid)) names.set(pledge.uid, '');
    } catch {
      // No names this time: the alert says "A Member", and the next poll tries again.
    }
  }
  const entries: CommunityAlertEntry[] = [];
  for (const { request, pledges } of pledgesOf) {
    const requestRef = { requestId: request.id, requestLabel: request.lines[0]?.name ?? '' };
    entries.push({
      ...base,
      ...requestRef,
      kind: 'pledgeRequest',
      uid: myUid,
      characterName: '',
      at: request.createdAt,
    });
    for (const pledge of pledges) {
      entries.push({
        ...base,
        ...requestRef,
        kind: 'pledge',
        uid: pledge.uid,
        characterName: names.get(pledge.uid) ?? '',
        at: pledge.updatedAt,
      });
    }
  }
  return entries;
}

export async function loadCommunityAlertEntries(
  characterId: number
): Promise<CommunityAlertEntry[] | null> {
  const admin = (await db.settings.get(adminKey(characterId)))?.value === true;
  const watching = await isWatchingCommunities(characterId);
  if (!admin && !watching) return [];
  const [{ getSyncAuth }, { uidForCharacter }, store, requests] = await Promise.all([
    import('@/sync/firebaseApp'),
    import('@/sync/uid'),
    import('./communityStore'),
    import('./requestStore'),
  ]);
  const myUid = uidForCharacter(characterId);
  if (getSyncAuth(characterId).currentUser?.uid !== myUid) return null;
  return store.withMyCommunities(characterId, async (mine) => {
    if (admin) await rememberCommunityAdmin(characterId, mine);
    const entries: CommunityAlertEntry[] = [];
    for (const community of mine) {
      if (admin && store.isCommunityAdmin(community, characterId)) {
        entries.push(...(await loadAdminEntries(characterId, community, store)));
      }
      if (watching) {
        entries.push(...(await loadPledgeEntries(characterId, myUid, community, store, requests)));
      }
    }
    return entries;
  });
}

async function loadAdminEntries(
  characterId: number,
  community: CommunitySummary,
  store: typeof import('./communityStore')
): Promise<CommunityAlertEntry[]> {
  const entries: CommunityAlertEntry[] = [];
  const base = { communityId: community.id, communityName: community.name };
  for (const request of await store.loadJoinRequests(characterId, community.id)) {
    entries.push({
      ...base,
      kind: 'request',
      uid: request.uid,
      characterName: request.characterName,
      at: request.requestedAt,
    });
  }
  let roster = rosters.get(community.id);
  if (roster?.count !== community.memberCount) {
    const members = await store.loadCommunityMembers(characterId, community.id);
    roster = {
      count: community.memberCount,
      entries: members.map((member) => ({
        ...base,
        kind: 'member' as const,
        uid: member.uid,
        characterName: member.characterName,
        at: member.joinedAt,
      })),
    };
    rosters.set(community.id, roster);
  }
  entries.push(...roster.entries);
  return entries;
}
