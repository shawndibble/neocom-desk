/**
 * Sample Communities for page stories: an in-memory stand-in for the
 * Community backend (`setCommunityBackendOverride`), so the page shows a
 * populated list with no network or sign-in. Stateful, so approving a request,
 * removing a Member or regenerating the link behaves in Storybook.
 *
 * Two Communities: one the active sample Character admins (every control
 * shows, a join request waits) and one it is only a Member of (Leave shows).
 */
import type {
  CommunityBackendOverride,
  CommunityMember,
  CommunitySummary,
  JoinRequest,
} from '@/features/communities/communityStore';
import { uidForCharacter } from '@/sync/uid';
import { SAMPLE_ACTIVE_CHARACTER, SAMPLE_CHARACTERS } from './sampleData';

const DAY = 24 * 3_600_000;

export const SAMPLE_ADMIN_COMMUNITY_ID = 'sample-brass-meridian';
export const SAMPLE_MEMBER_COMMUNITY_ID = 'sample-providence-co-op';

const ME = uidForCharacter(SAMPLE_ACTIVE_CHARACTER.characterId);
const OTHER = uidForCharacter(SAMPLE_CHARACTERS[1].characterId);

export function createCommunitiesFixture(now = Date.now()): CommunityBackendOverride {
  const communities: CommunitySummary[] = [
    {
      id: SAMPLE_ADMIN_COMMUNITY_ID,
      name: 'Brass Meridian Industrialists',
      adminUid: ME,
      inviteCode: 'brass-4kq9x2',
      memberCount: 9,
      requireApproval: true,
    },
    {
      id: SAMPLE_MEMBER_COMMUNITY_ID,
      name: 'Providence Mining Co-op',
      adminUid: OTHER,
      inviteCode: null,
      memberCount: 4,
    },
  ];

  const member = (
    uid: string,
    characterName: string,
    joinedDays: number,
    libraryAgeDays: number | null
  ): CommunityMember => ({
    uid,
    characterName,
    joinedAt: now - joinedDays * DAY,
    libraryAsOf: libraryAgeDays === null ? null : now - libraryAgeDays * DAY,
  });

  const members: Record<string, CommunityMember[]> = {
    [SAMPLE_ADMIN_COMMUNITY_ID]: [
      member(ME, SAMPLE_ACTIVE_CHARACTER.name, 120, 0.1),
      member(OTHER, SAMPLE_CHARACTERS[1].name, 118, 1),
      member('char:2119000001', 'Ilvara Nokk', 96, 2),
      member('char:2119000002', 'Dax Orrelin', 80, 12),
      member('char:2119000003', 'Thessaly Brandt', 64, 45),
      member('char:2119000004', 'Mikael Ostrander', 41, null),
      member('char:2119000005', 'Sable Quillon', 30, 3),
      member('char:2119000006', 'Veyra Dunmoor', 12, 0.5),
      member('char:2119000007', 'Rook Halvard', 3, null),
    ],
    [SAMPLE_MEMBER_COMMUNITY_ID]: [
      member(OTHER, SAMPLE_CHARACTERS[1].name, 200, 4),
      member(ME, SAMPLE_ACTIVE_CHARACTER.name, 90, 1),
      member('char:2119000008', 'Pell Anders', 60, 20),
      member('char:2119000009', 'Juno Karrow', 14, null),
    ],
  };

  const requests: Record<string, JoinRequest[]> = {
    [SAMPLE_ADMIN_COMMUNITY_ID]: [
      { uid: 'char:2119000010', characterName: 'Anselm Voss', requestedAt: now - 2 * 3_600_000 },
      { uid: 'char:2119000011', characterName: 'Marisol Teague', requestedAt: now - DAY },
    ],
  };

  const byId = (id: string) => communities.find((community) => community.id === id);
  const patch = (id: string, change: Partial<CommunitySummary>) => {
    const community = byId(id);
    if (community) Object.assign(community, change);
  };

  return {
    loadMine: () => communities.map((community) => ({ ...community })),
    loadMembers: (id) => (members[id] ?? []).map((entry) => ({ ...entry })),
    loadRequests: (id) => (requests[id] ?? []).map((entry) => ({ ...entry })),
    call: (name, data) => {
      const { communityId, memberUid, accept, requireApproval } = data as {
        communityId: string;
        memberUid: string;
        accept: boolean;
        requireApproval: boolean;
      };
      switch (name) {
        case 'revokeCommunityInviteCallable':
          patch(communityId, { inviteCode: null });
          return {};
        case 'regenerateCommunityInviteCallable': {
          const inviteCode = `brass-${Math.random().toString(36).slice(2, 8)}`;
          patch(communityId, { inviteCode });
          return { inviteCode };
        }
        case 'setCommunityApprovalCallable':
          patch(communityId, { requireApproval });
          return {};
        case 'decideCommunityJoinRequestCallable': {
          const waiting = requests[communityId] ?? [];
          const request = waiting.find((entry) => entry.uid === memberUid);
          requests[communityId] = waiting.filter((entry) => entry.uid !== memberUid);
          if (accept && request) {
            members[communityId].push(member(request.uid, request.characterName, 0, null));
            patch(communityId, { memberCount: (byId(communityId)?.memberCount ?? 0) + 1 });
          }
          return {};
        }
        case 'removeCommunityMemberCallable':
          members[communityId] = members[communityId].filter((entry) => entry.uid !== memberUid);
          patch(communityId, { memberCount: members[communityId].length });
          return {};
        case 'transferCommunityAdminCallable':
          patch(communityId, { adminUid: memberUid });
          return {};
        case 'leaveCommunityCallable':
        case 'deleteCommunityCallable':
          communities.splice(
            communities.findIndex((community) => community.id === communityId),
            1
          );
          return {};
        default:
          return {};
      }
    },
  };
}
