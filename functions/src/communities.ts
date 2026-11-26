import { randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

export const MAX_COMMUNITY_MEMBERS = 100;
export const MAX_COMMUNITIES_PER_CHARACTER = 10;
export const MAX_MAIL_INVITES_PER_DAY = 20;
export const MAX_COMMUNITY_NAME_LENGTH = 60;
export const MAX_CHARACTER_NAME_LENGTH = 100;
const MAX_INVITE_CODE_LENGTH = 64;

export const COMMUNITIES_COLLECTION = 'communities';
export const COMMUNITY_MEMBERS_COLLECTION = 'members';
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
export type TransferAdminInput = RemoveMemberInput;
export interface RequireApprovalInput extends CommunityIdInput {
  requireApproval: boolean;
}
export interface JoinRequestDecisionInput extends RemoveMemberInput {
  accept: boolean;
}

export function record(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    throw new HttpsError('invalid-argument', 'object input required');
  }
  return data as Record<string, unknown>;
}

export function boundedString(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be 1-${max} characters`);
  }
  return text;
}

export function docId(value: unknown, field: string): string {
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

export interface PreviewInviteInput {
  inviteCode: string;
}

export function parsePreviewInput(data: unknown): PreviewInviteInput {
  return {
    inviteCode: boundedString(record(data).inviteCode, 'inviteCode', MAX_INVITE_CODE_LENGTH),
  };
}

export interface MailInviteInput extends CommunityIdInput {
  targetCharacterId: number;
  targetName: string;
}

export function parseMailInviteInput(data: unknown): MailInviteInput {
  const d = record(data);
  const id = d.targetCharacterId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new HttpsError('invalid-argument', 'targetCharacterId must be a Character id');
  }
  return {
    communityId: docId(d.communityId, 'communityId'),
    targetCharacterId: id,
    targetName: boundedString(d.targetName, 'targetName', MAX_CHARACTER_NAME_LENGTH),
  };
}

export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export const MAIL_RELEASE_WINDOW_MS = 2 * 60_000;
export const MAIL_RELEASE_BUDGET_PER_DAY = 3;
export const MAIL_RESERVATION_STALE_MS = 10 * 60_000;
export const MAIL_MAX_ATTEMPTS_PER_TARGET = 3;

export interface MailInviteRecord {
  sentAt: number | null;
  reservedAt: number;
  attempts: number;
}

export type MailInviteDecision = 'ok' | 'retake' | 'already-invited' | 'daily-cap';

export function decideMailInvite(state: {
  dailyCount: number;
  existing: MailInviteRecord | null;
  now: number;
}): MailInviteDecision {
  const { existing } = state;
  if (existing) {
    const stale = state.now - existing.reservedAt >= MAIL_RESERVATION_STALE_MS;
    return existing.sentAt === null && stale && existing.attempts < MAIL_MAX_ATTEMPTS_PER_TARGET
      ? 'retake'
      : 'already-invited';
  }
  return state.dailyCount >= MAX_MAIL_INVITES_PER_DAY ? 'daily-cap' : 'ok';
}

export type MailReleaseDecision = 'refund' | 'keep';

export function decideMailRelease(state: {
  existing: MailInviteRecord;
  refundsToday: number;
  now: number;
}): MailReleaseDecision {
  const fresh = state.now - state.existing.reservedAt <= MAIL_RELEASE_WINDOW_MS;
  return state.existing.sentAt === null && fresh && state.refundsToday < MAIL_RELEASE_BUDGET_PER_DAY
    ? 'refund'
    : 'keep';
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

export function parseRequireApprovalInput(data: unknown): RequireApprovalInput {
  const input = record(data);
  if (typeof input.requireApproval !== 'boolean') {
    throw new HttpsError('invalid-argument', 'requireApproval must be true or false');
  }
  return {
    communityId: docId(input.communityId, 'communityId'),
    requireApproval: input.requireApproval,
  };
}

export function parseJoinRequestDecisionInput(data: unknown): JoinRequestDecisionInput {
  const input = record(data);
  if (typeof input.accept !== 'boolean') {
    throw new HttpsError('invalid-argument', 'accept must be true or false');
  }
  return {
    communityId: docId(input.communityId, 'communityId'),
    memberUid: docId(input.memberUid, 'memberUid'),
    accept: input.accept,
  };
}

export function parseTransferAdminInput(data: unknown): TransferAdminInput {
  return parseRemoveMemberInput(data);
}

export function newInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

export type CreateDecision = 'ok' | 'too-many-communities';

export function decideCreate(joinedCount: number): CreateDecision {
  return joinedCount >= MAX_COMMUNITIES_PER_CHARACTER ? 'too-many-communities' : 'ok';
}

export type JoinDecision =
  | 'ok'
  | 'needs-approval'
  | 'invalid-invite'
  | 'already-member'
  | 'community-full'
  | 'too-many-communities';

export function decideJoin(state: {
  inviteMatches: boolean;
  alreadyMember: boolean;
  memberCount: number;
  joinedCount: number;
  requiresApproval?: boolean;
  preApproved?: boolean;
}): JoinDecision {
  if (!state.inviteMatches) return 'invalid-invite';
  if (state.alreadyMember) return 'already-member';
  if (state.memberCount >= MAX_COMMUNITY_MEMBERS) return 'community-full';
  if (state.joinedCount >= MAX_COMMUNITIES_PER_CHARACTER) return 'too-many-communities';
  if (state.requiresApproval && !state.preApproved) return 'needs-approval';
  return 'ok';
}

export function isPreApproved(
  invite: { adminUid: string; sentAt: number | null; consumedAt: number | null } | null,
  currentAdminUid: string
): boolean {
  return (
    invite !== null &&
    invite.sentAt !== null &&
    invite.consumedAt === null &&
    invite.adminUid === currentAdminUid
  );
}

export type AdmitDecision = 'ok' | 'already-member' | 'community-full' | 'too-many-communities';

export function decideAdmit(state: {
  alreadyMember: boolean;
  memberCount: number;
  joinedCount: number;
}): AdmitDecision {
  if (state.alreadyMember) return 'already-member';
  if (state.memberCount >= MAX_COMMUNITY_MEMBERS) return 'community-full';
  if (state.joinedCount >= MAX_COMMUNITIES_PER_CHARACTER) return 'too-many-communities';
  return 'ok';
}

export type LeaveDecision = 'ok' | 'not-a-member' | 'admin-cannot-leave';

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

export type TransferAdminDecision = 'ok' | 'not-admin' | 'already-admin' | 'not-a-member';

export function decideTransferAdmin(state: {
  adminUid: string;
  callerUid: string;
  targetUid: string;
  targetIsMember: boolean;
}): TransferAdminDecision {
  if (state.callerUid !== state.adminUid) return 'not-admin';
  if (state.targetUid === state.adminUid) return 'already-admin';
  return state.targetIsMember ? 'ok' : 'not-a-member';
}
