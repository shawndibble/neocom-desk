/**
 * Sample Communities for page stories: an in-memory stand-in for the
 * Community backend (`setCommunityBackendOverride`), so the page shows a
 * populated list with no network or sign-in. Stateful, so approving a request,
 * removing a Member or regenerating the link behaves in Storybook.
 *
 * Two Communities: one the active sample Character admins (every control
 * shows, a join request waits) and one it is only a Member of (Leave shows).
 * Both carry shared blueprints, Fittings and Skill plans, so the content
 * tabs' Everyone views fill, and the sample Character's own share shows under
 * Mine.
 */
import type { CommunityRequest, RequestLine } from '@/engine/communities/requests';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { SharedFitting } from '@/engine/communities/sharedFittings';
import type { SharedBlueprint } from '@/engine/communities/sharedLibrary';
import type { SharedPlan } from '@/engine/communities/sharedPlans';
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

  const blueprint = (typeId: number, runs: number, place: string): SharedBlueprint => ({
    typeId,
    me: 10,
    te: 20,
    runs,
    locationName: `${place} - Industry Hub`,
    systemName: place,
  });
  const libraries: Record<string, MemberLibrary[]> = {
    [SAMPLE_ADMIN_COMMUNITY_ID]: [
      {
        uid: ME,
        items: [
          blueprint(691, -1, 'Efa'),
          blueprint(32881, 40, 'Efa'),
          blueprint(11534, 10, 'Efa'),
        ],
      },
      { uid: OTHER, items: [blueprint(24699, -1, 'Amarr'), blueprint(950, 10, 'Amarr')] },
      { uid: 'char:2119000001', items: [blueprint(2184, -1, 'Jita'), blueprint(691, 5, 'Jita')] },
      { uid: 'char:2119000003', items: [blueprint(940, -1, 'Dodixie')] },
    ],
    [SAMPLE_MEMBER_COMMUNITY_ID]: [
      { uid: OTHER, items: [blueprint(32881, -1, 'Amarr')] },
      { uid: ME, items: [blueprint(691, -1, 'Efa')] },
    ],
  };

  const fitting = (
    communityId: string,
    ownerUid: string,
    key: string,
    name: string,
    hull: string,
    source: 'saved' | 'game' = 'saved'
  ): SharedFitting => ({
    communityId,
    id: `${ownerUid}~${source}-${key}`,
    ownerUid,
    source,
    name,
    hull,
    // A sample, not a decodable Fitting Share Code: the list only links to it.
    code: `sample-${key}`,
    updatedAt: now - DAY,
  });
  const fittings: Record<string, SharedFitting[]> = {
    [SAMPLE_ADMIN_COMMUNITY_ID]: [
      fitting(SAMPLE_ADMIN_COMMUNITY_ID, ME, 'venture-gas', 'Gas Huffer', 'Venture'),
      fitting(SAMPLE_ADMIN_COMMUNITY_ID, OTHER, 'drake-l4', 'L4 Missions Drake', 'Drake'),
      fitting(SAMPLE_ADMIN_COMMUNITY_ID, OTHER, '17', 'Hauler (cargo)', 'Badger', 'game'),
      fitting(
        SAMPLE_ADMIN_COMMUNITY_ID,
        'char:2119000001',
        'rifter-brawl',
        'Brawl Rifter',
        'Rifter'
      ),
    ],
    [SAMPLE_MEMBER_COMMUNITY_ID]: [
      fitting(SAMPLE_MEMBER_COMMUNITY_ID, OTHER, 'procurer', 'Belt Procurer', 'Procurer'),
    ],
  };

  const plan = (
    communityId: string,
    ownerUid: string,
    planId: string,
    name: string,
    skills: number
  ): SharedPlan => ({
    communityId,
    id: `${ownerUid}~${planId}`,
    ownerUid,
    planId,
    name,
    entries: Array.from({ length: skills }, (_, index) => ({
      skillTypeID: 3300 + index,
      targetLevel: 4,
    })),
    updatedAt: now - 2 * DAY,
    sourceUpdatedAt: now - 2 * DAY,
  });
  const plans: Record<string, SharedPlan[]> = {
    [SAMPLE_ADMIN_COMMUNITY_ID]: [
      plan(SAMPLE_ADMIN_COMMUNITY_ID, OTHER, 'p1', 'Industry basics', 12),
      plan(SAMPLE_ADMIN_COMMUNITY_ID, 'char:2119000002', 'p2', 'Marauder', 38),
      plan(SAMPLE_ADMIN_COMMUNITY_ID, ME, 'p3', 'Mining foreman', 9),
    ],
    [SAMPLE_MEMBER_COMMUNITY_ID]: [
      plan(SAMPLE_MEMBER_COMMUNITY_ID, OTHER, 'p4', 'Exhumer path', 21),
    ],
  };

  const wanted = (
    id: string,
    ownerUid: string,
    ownerName: string,
    location: string,
    terms: string,
    ageHours: number,
    lines: RequestLine[]
  ): CommunityRequest => ({
    id,
    ownerUid,
    ownerName,
    location,
    terms,
    lines,
    createdAt: now - ageHours * 3_600_000,
    lastActivityAt: now - ageHours * 3_600_000,
    expiresAt: now - ageHours * 3_600_000 + 30 * DAY,
    closed: false,
  });
  const item = (typeId: number, name: string, quantity: number): RequestLine => ({
    typeId,
    name,
    quantity,
    kind: 'item',
  });
  const itemRequests: Record<string, CommunityRequest[]> = {
    [SAMPLE_ADMIN_COMMUNITY_ID]: [
      wanted(
        'req-1',
        'char:2119000001',
        'Ilvara Nokk',
        'Badivefi, Khanid',
        'Budget 300M total, payment negotiable',
        2,
        [
          item(16634, 'Reactive Metals', 350000),
          item(16633, 'Toxic Metals', 300000),
          item(16655, 'Chiral Structures', 175000),
        ]
      ),
      wanted(
        'req-2',
        'char:2119000002',
        'Dax Orrelin',
        'Domain (region)',
        '90% JBV, will accept contracts daily',
        24,
        [
          {
            typeId: 11534,
            name: 'Scan Acquisition Array I Blueprint',
            quantity: 2,
            kind: 'bpc',
            runs: 10,
            me: 10,
          },
          {
            typeId: 11535,
            name: 'Scan Rangefinding Array I Blueprint',
            quantity: 2,
            kind: 'bpc',
            runs: 10,
            me: 10,
          },
        ]
      ),
      wanted('req-3', ME, SAMPLE_ACTIVE_CHARACTER.name, 'Efa', '', 72, [
        { typeId: 33328, name: 'Ishtar Blueprint', quantity: 3, kind: 'bpc', runs: 5 },
      ]),
      wanted('req-4', 'char:2119000003', 'Thessaly Brandt', 'Jita', '', 120, [
        item(34, 'Tritanium', 10000000),
        item(35, 'Pyerite', 2000000),
        item(36, 'Mexallon', 400000),
      ]),
    ],
    [SAMPLE_MEMBER_COMMUNITY_ID]: [],
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
    loadLibraries: (id) => libraries[id] ?? [],
    loadFittings: (id) => (fittings[id] ?? []).map((entry) => ({ ...entry })),
    loadItemRequests: (id) => (itemRequests[id] ?? []).map((entry) => ({ ...entry })),
    loadPlans: (id) => (plans[id] ?? []).map((entry) => ({ ...entry })),
    call: (name, data) => {
      const { communityId, memberUid, accept, requireApproval } = data as {
        communityId: string;
        memberUid: string;
        accept: boolean;
        requireApproval: boolean;
      };
      switch (name) {
        case 'postCommunityRequestCallable': {
          const draft = data as { location: string; terms: string; lines: RequestLine[] };
          const posted = wanted(
            `req-${Math.random().toString(36).slice(2, 8)}`,
            ME,
            SAMPLE_ACTIVE_CHARACTER.name,
            draft.location,
            draft.terms,
            0,
            draft.lines
          );
          itemRequests[communityId] = [posted, ...(itemRequests[communityId] ?? [])];
          return { requestId: posted.id };
        }
        case 'extendCommunityRequestCallable': {
          const { requestId } = data as { requestId: string };
          const found = itemRequests[communityId]?.find((entry) => entry.id === requestId);
          if (found) found.expiresAt = now + 30 * DAY;
          return { expiresAt: now + 30 * DAY };
        }
        case 'setCommunityRequestClosedCallable': {
          const { requestId, closed } = data as { requestId: string; closed: boolean };
          const found = itemRequests[communityId]?.find((entry) => entry.id === requestId);
          if (found) found.closed = closed;
          return {};
        }
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
