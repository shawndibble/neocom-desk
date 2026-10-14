/**
 * What the Community alerts poll reads for one Character: the waiting list and
 * the roster of every Community it administers (`engine/communities/communityAlert.ts`
 * diffs two reads).
 *
 * Cost is kept off everyone who never runs a Community. A Character is only
 * read once the Communities page has seen it administer one (`rememberCommunityAdmin`),
 * and only while the Firebase session is already its own: the poll never mints
 * a token or swaps the session, which the sync sweep and the Communities page
 * are relying on. A Character it cannot read right now returns null, so the
 * poll skips rather than writing a baseline that would make the next good poll
 * look like a burst of arrivals.
 *
 * The roster is the expensive read (a document per Member), so it is refetched
 * only when the Community's Member count moves.
 */
import { db } from '@/db';
import type { CommunityAlertEntry } from '@/engine/communities/communityAlert';
import { communityBackendOverride } from './backendOverride';
import { isCommunityAdmin, type CommunitySummary } from './communityStore';

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

export async function loadCommunityAlertEntries(
  characterId: number
): Promise<CommunityAlertEntry[] | null> {
  if ((await db.settings.get(adminKey(characterId)))?.value !== true) return [];
  const [{ getSyncAuth }, { uidForCharacter }, store] = await Promise.all([
    import('@/sync/firebaseApp'),
    import('@/sync/uid'),
    import('./communityStore'),
  ]);
  if (getSyncAuth().currentUser?.uid !== uidForCharacter(characterId)) return null;
  const mine = await store.loadMyCommunities(characterId);
  await rememberCommunityAdmin(characterId, mine);
  const administered = mine.filter((community) => store.isCommunityAdmin(community, characterId));
  const entries: CommunityAlertEntry[] = [];
  for (const community of administered) {
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
  }
  return entries;
}
