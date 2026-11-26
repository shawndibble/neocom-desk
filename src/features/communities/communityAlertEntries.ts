import { db } from '@/db';
import type { CommunityAlertEntry } from '@/engine/communities/communityAlert';
import { isOpenRequest } from '@/engine/communities/requests';
import { communityBackendOverride } from './backendOverride';
import { isCommunityAdmin, type CommunitySummary } from './communityStore';
import { isWatchingCommunities } from './requestBadge';

const adminKey = (characterId: number) => `communityAdmin:${characterId}`;

export async function rememberCommunityAdmin(
  characterId: number,
  communities: readonly CommunitySummary[]
): Promise<void> {
  if (communityBackendOverride()) return;
  const admin = communities.some((community) => isCommunityAdmin(community, characterId));
  if (admin) await db.settings.put({ key: adminKey(characterId), value: true });
  else await db.settings.delete(adminKey(characterId));
}

const rosters = new Map<string, { count: number; entries: CommunityAlertEntry[] }>();

const pledgerNames = new Map<string, Map<string, string>>();

async function loadPledgeEntries(
  characterId: number,
  myUid: string,
  community: CommunitySummary,
  store: typeof import('./communityStore'),
  requests: typeof import('./requestStore')
): Promise<CommunityAlertEntry[]> {
  const now = Date.now();
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
      for (const pledge of unseen) if (!names.has(pledge.uid)) names.set(pledge.uid, '');
    } catch {}
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
