// Communities (issue #3596, ADR 0018): the pure half of the callables that
// create, join, leave and administer a Community. Rules can't express the
// 100-Member and 10-Communities caps or delete-on-leave, so those writes go
// through the admin SDK (communitiesStore.ts); the decisions live here, with
// no Firestore, so they are unit testable. The wiring is in index.ts.

import { randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

/** Members per Community, the admin included. */
export const MAX_COMMUNITY_MEMBERS = 100;
/** Communities one Character can belong to. */
export const MAX_COMMUNITIES_PER_CHARACTER = 10;
export const MAX_COMMUNITY_NAME_LENGTH = 60;
export const MAX_CHARACTER_NAME_LENGTH = 100;
const MAX_INVITE_CODE_LENGTH = 64;

export const COMMUNITIES_COLLECTION = 'communities';
export const COMMUNITY_MEMBERS_COLLECTION = 'members';
/** `characters/{uid}/communities/{communityId}`: a Character's membership index. */
export const CHARACTER_COMMUNITIES_COLLECTION = 'communities';

export interface CreateCommunityInput {
  name: string;
  characterName: string;
}
export interface JoinCommunityInput {
  inviteCode: string;
  characterName: string;
}
export interface CommunityIdInput {
  communityId: string;
}
export interface RemoveMemberInput extends CommunityIdInput {
  memberUid: string;
}

function record(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    throw new HttpsError('invalid-argument', 'object input required');
  }
  return data as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be 1-${max} characters`);
  }
  return text;
}

// A Firestore doc id built from client input: no '/' (a path escape) and
// nothing outside the ids this module and the client mint.
function docId(value: unknown, field: string): string {
  const text = boundedString(value, field, 128);
  if (!/^[A-Za-z0-9_:-]+$/.test(text)) {
    throw new HttpsError('invalid-argument', `${field} is not a valid id`);
  }
  return text;
}

export function parseCreateInput(data: unknown): CreateCommunityInput {
  const d = record(data);
  return {
    name: boundedString(d.name, 'name', MAX_COMMUNITY_NAME_LENGTH),
    characterName: boundedString(d.characterName, 'characterName', MAX_CHARACTER_NAME_LENGTH),
  };
}

export function parseJoinInput(data: unknown): JoinCommunityInput {
  const d = record(data);
  return {
    inviteCode: boundedString(d.inviteCode, 'inviteCode', MAX_INVITE_CODE_LENGTH),
    characterName: boundedString(d.characterName, 'characterName', MAX_CHARACTER_NAME_LENGTH),
  };
}

export function parseCommunityIdInput(data: unknown): CommunityIdInput {
  return { communityId: docId(record(data).communityId, 'communityId') };
}

export function parseRemoveMemberInput(data: unknown): RemoveMemberInput {
  const d = record(data);
  const memberUid = docId(d.memberUid, 'memberUid');
  if (!memberUid.startsWith('char:')) {
    throw new HttpsError('invalid-argument', 'memberUid must be a Character uid');
  }
  return { communityId: docId(d.communityId, 'communityId'), memberUid };
}

/** 128 random bits, URL-safe: the invite link is the only gate to a Community. */
export function newInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

export type CreateDecision = 'ok' | 'too-many-communities';

export function decideCreate(joinedCount: number): CreateDecision {
  return joinedCount >= MAX_COMMUNITIES_PER_CHARACTER ? 'too-many-communities' : 'ok';
}

export type JoinDecision =
  'ok' | 'invalid-invite' | 'already-member' | 'community-full' | 'too-many-communities';

export function decideJoin(state: {
  inviteMatches: boolean;
  alreadyMember: boolean;
  memberCount: number;
  joinedCount: number;
}): JoinDecision {
  if (!state.inviteMatches) return 'invalid-invite';
  if (state.alreadyMember) return 'already-member';
  if (state.memberCount >= MAX_COMMUNITY_MEMBERS) return 'community-full';
  if (state.joinedCount >= MAX_COMMUNITIES_PER_CHARACTER) return 'too-many-communities';
  return 'ok';
}

export type LeaveDecision = 'ok' | 'not-a-member' | 'admin-cannot-leave';

/** The admin deletes the Community instead: there is no co-admin to hand it to (v1). */
export function decideLeave(state: {
  adminUid: string;
  callerUid: string;
  isMember: boolean;
}): LeaveDecision {
  if (!state.isMember) return 'not-a-member';
  return state.callerUid === state.adminUid ? 'admin-cannot-leave' : 'ok';
}

export type RemoveMemberDecision = 'ok' | 'not-admin' | 'cannot-remove-admin' | 'not-a-member';

export function decideRemoveMember(state: {
  adminUid: string;
  callerUid: string;
  targetUid: string;
  targetIsMember: boolean;
}): RemoveMemberDecision {
  if (state.callerUid !== state.adminUid) return 'not-admin';
  if (state.targetUid === state.adminUid) return 'cannot-remove-admin';
  return state.targetIsMember ? 'ok' : 'not-a-member';
}
