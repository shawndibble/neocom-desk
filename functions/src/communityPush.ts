import { characterIdOfUid, isOpenRequest } from './communityRequests.js';
import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from './serverEvents.js';

export const ADMITTED_FROM_REQUEST = 'request';

export interface CommunityDoc {
  name?: unknown;
  adminUid?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function adminOf(community: CommunityDoc | null): { characterId: number; uid: string } | null {
  if (!community || typeof community.adminUid !== 'string') return null;
  const characterId = characterIdOfUid(community.adminUid);
  return characterId === null ? null : { characterId, uid: community.adminUid };
}

export function joinRequestFire(input: {
  communityId: string;
  community: CommunityDoc | null;
  uid: string;
  request: { characterName?: unknown; requestedAt?: unknown };
}): CommunityJoinRequestFire | null {
  const admin = adminOf(input.community);
  const at = finite(input.request.requestedAt);
  if (!admin || at === null) return null;
  return {
    eventId: 'communityJoinRequest',
    characterId: admin.characterId,
    communityId: input.communityId,
    communityName: text(input.community?.name),
    uid: input.uid,
    characterName: text(input.request.characterName),
    at,
  };
}

export function memberJoinedFire(input: {
  communityId: string;
  community: CommunityDoc | null;
  uid: string;
  member: { characterName?: unknown; joinedAt?: unknown; admittedFrom?: unknown };
}): CommunityMemberJoinedFire | null {
  const admin = adminOf(input.community);
  const at = finite(input.member.joinedAt);
  if (!admin || at === null || input.uid === admin.uid) return null;
  if (input.member.admittedFrom === ADMITTED_FROM_REQUEST) return null;
  return {
    eventId: 'communityMemberJoined',
    characterId: admin.characterId,
    communityId: input.communityId,
    communityName: text(input.community?.name),
    uid: input.uid,
    characterName: text(input.member.characterName),
    at,
  };
}

export interface ItemRequestDoc {
  ownerUid?: unknown;
  closed?: unknown;
  expiresAt?: unknown;
  standing?: unknown;
  notify?: unknown;
  lines?: unknown;
}

export function requestPledgedFire(input: {
  communityId: string;
  communityName: string;
  requestId: string;
  request: ItemRequestDoc | null;
  pledgerUid: string;
  pledgerName: string;
  pledgedAt: number;
  now: number;
}): CommunityRequestPledgedFire | null {
  const { request } = input;
  if (!request || typeof request.ownerUid !== 'string') return null;
  const ownerId = characterIdOfUid(request.ownerUid);
  if (ownerId === null || input.pledgerUid === request.ownerUid) return null;
  if (request.standing === true) return null;
  const notify = request.notify as { app?: unknown } | undefined;
  if (notify?.app !== true) return null;
  const open = isOpenRequest(
    { closed: request.closed === true, expiresAt: finite(request.expiresAt) ?? 0 },
    input.now
  );
  if (!open) return null;
  const firstLine = Array.isArray(request.lines) ? (request.lines[0] as { name?: unknown }) : null;
  return {
    eventId: 'communityRequestPledged',
    characterId: ownerId,
    communityId: input.communityId,
    communityName: input.communityName,
    uid: input.pledgerUid,
    characterName: input.pledgerName,
    requestId: input.requestId,
    requestLabel: text(firstLine?.name),
    count: 1,
    at: input.pledgedAt,
  };
}
