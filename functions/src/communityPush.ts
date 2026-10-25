// Community events pushed the moment the backend writes them (issue #5121).
// Pure: the Firestore triggers in index.ts read the documents and hand them
// here; this decides whether the write is an alert and builds the fire the
// Foreground Poller would have built for it (`src/engine/communities/
// communityAlert.ts`), so the Occurrence Key matches and the open app does not
// file a second row.

import { characterIdOfUid, isOpenRequest } from './communityRequests.js';
import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from './serverEvents.js';

/** How the member doc says it was made; set by `decideJoinRequest`'s admit. */
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

/** A Character asked to join (a `requests/{uid}` doc was created): the admin is told. */
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

/**
 * A Member doc was created. Not for the admin founding the Community, and not
 * for a Member the admin just let in from the waiting list: the join request
 * already told them, and they did it themselves (the Foreground Poller's
 * "already waiting" rule).
 */
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

/**
 * A Pledge doc was created: the requester is told, under the client's rules
 * (`loadPledgeEntries`): only on their own open, non-standing Request that
 * asked for the app, never for their own Pledge.
 */
export function requestPledgedFire(input: {
  communityId: string;
  communityName: string;
  requestId: string;
  request: ItemRequestDoc | null;
  pledgerUid: string;
  pledgerName: string;
  /** The Pledge's `updatedAt`, ms: the client keys the occurrence by it. */
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
