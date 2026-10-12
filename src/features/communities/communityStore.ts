/**
 * Communities client (issue #3597, ADR 0018): reads through Firestore under
 * the membership rules, every write through the Community callables
 * (functions/src/communities*.ts), which enforce the caps and the
 * delete-on-leave. The list of a Character's Communities comes from its own
 * membership index, because `communities` itself cannot be listed. Firestore
 * here is the `lite` build (no listeners), so callers refetch after a change.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { httpsCallable } from 'firebase/functions';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { SharedBlueprint } from '@/engine/communities/sharedLibrary';
import { getSyncFirestore, getSyncFunctions } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';

export interface CommunitySummary {
  id: string;
  name: string;
  adminUid: string;
  /** Null once the admin has revoked the link. */
  inviteCode: string | null;
  memberCount: number;
}

export interface CommunityMember {
  uid: string;
  characterName: string;
  joinedAt: number;
  /** When the Member's Shared Blueprints were last refreshed; null when it shares none. */
  libraryAsOf: number | null;
}

/** Where an invite link lands. The join page is its own ticket; this is its one address. */
export function communityInviteUrl(inviteCode: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/communities/join/${inviteCode}`;
}

export function isCommunityAdmin(community: CommunitySummary, characterId: number): boolean {
  return community.adminUid === uidForCharacter(characterId);
}

export async function loadMyCommunities(characterId: number): Promise<CommunitySummary[]> {
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  const index = await getDocs(collection(db, 'characters', uid, 'communities'));
  const loaded = await Promise.all(
    index.docs.map(async (entry) => {
      const snap = await getDoc(doc(db, 'communities', entry.id));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        name: String(data.name ?? ''),
        adminUid: String(data.adminUid ?? ''),
        inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : null,
        memberCount: Number(data.memberCount ?? 0),
      } satisfies CommunitySummary;
    })
  );
  return loaded
    .filter((community): community is CommunitySummary => community !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCommunityMembers(
  characterId: number,
  communityId: string
): Promise<CommunityMember[]> {
  await ensureSignedIn(characterId);
  const snap = await getDocs(collection(getSyncFirestore(), 'communities', communityId, 'members'));
  return snap.docs
    .map((entry) => ({
      uid: entry.id,
      characterName: String(entry.data().characterName ?? ''),
      joinedAt: Number(entry.data().joinedAt ?? 0),
      libraryAsOf: libraryAsOf(entry.data()),
    }))
    .sort((a, b) => a.characterName.localeCompare(b.characterName));
}

/** Every listed Member's shared blueprints, for the Community Library. A Member with none yields an empty list. */
export async function loadMemberLibraries(
  characterId: number,
  communityId: string,
  memberUids: readonly string[]
): Promise<MemberLibrary[]> {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  return Promise.all(
    memberUids.map(async (uid) => {
      // One unreadable Member (just removed, say) must not blank everyone else's column.
      try {
        const chunks = await getDocs(
          collection(db, 'communities', communityId, 'members', uid, 'library')
        );
        const items = chunks.docs.flatMap((chunk) => {
          const list = chunk.data().items;
          return Array.isArray(list) ? (list as SharedBlueprint[]) : [];
        });
        return { uid, items };
      } catch {
        return { uid, items: [] };
      }
    })
  );
}

/** The pushed-at stamp, only while the Member shares anything (a cleared library has chunkCount 0). */
function libraryAsOf(data: Record<string, unknown>): number | null {
  const stamp = data.pushedAt as { toMillis?: () => number } | undefined;
  if (!stamp?.toMillis || !Number(data.chunkCount ?? 0)) return null;
  return stamp.toMillis();
}

async function call<In, Out>(characterId: number, name: string, data: In): Promise<Out> {
  await ensureSignedIn(characterId);
  const result = await httpsCallable<In, Out>(getSyncFunctions(), name)(data);
  return result.data;
}

export interface InvitePreview {
  name: string;
  adminName: string;
  memberCount: number;
}

/** The invite page's preview. Needs no session: a visitor has not signed in yet. */
export async function previewInvite(inviteCode: string): Promise<InvitePreview> {
  const result = await httpsCallable<{ inviteCode: string }, InvitePreview>(
    getSyncFunctions(),
    'previewCommunityCallable'
  )({ inviteCode });
  return result.data;
}

export function joinCommunity(characterId: number, inviteCode: string, characterName: string) {
  return call<
    { inviteCode: string; characterName: string },
    { communityId: string; alreadyMember: boolean }
  >(characterId, 'joinCommunityCallable', { inviteCode, characterName });
}

export interface MailInviteReservation {
  inviteCode: string;
  communityName: string;
  adminName: string;
  remaining: number;
}

/** Claims a daily mail invite and the one-per-target slot; the server holds the cap. */
export function reserveMailInvite(
  characterId: number,
  communityId: string,
  targetCharacterId: number,
  targetName: string
) {
  return call<
    { communityId: string; targetCharacterId: number; targetName: string },
    MailInviteReservation
  >(characterId, 'reserveCommunityMailInviteCallable', {
    communityId,
    targetCharacterId,
    targetName,
  });
}

export async function confirmMailInvite(
  characterId: number,
  communityId: string,
  targetCharacterId: number,
  targetName: string
): Promise<void> {
  await call(characterId, 'confirmCommunityMailInviteCallable', {
    communityId,
    targetCharacterId,
    targetName,
  });
}

/** Gives the reserved slot back after a failed send. */
export async function releaseMailInvite(
  characterId: number,
  communityId: string,
  targetCharacterId: number,
  targetName: string
): Promise<void> {
  await call(characterId, 'releaseCommunityMailInviteCallable', {
    communityId,
    targetCharacterId,
    targetName,
  });
}

export const MAX_MAIL_INVITES_PER_DAY = 20;

export interface SentMailInvite {
  targetCharacterId: number;
  targetName: string;
  sentAt: number;
}

/** Mail invites left today (UTC) and the ones already sent from this Community, newest first. */
export async function loadMailInviteStatus(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<{ remaining: number; sent: SentMailInvite[] }> {
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  const day = new Date(now).toISOString().slice(0, 10);
  const [quota, invites] = await Promise.all([
    getDoc(doc(db, 'characters', uid, 'mailInviteQuota', day)),
    getDocs(collection(db, 'communities', communityId, 'mailInvites')),
  ]);
  const used = Number(quota.exists() ? (quota.data().count ?? 0) : 0);
  const sent = invites.docs
    .filter((entry) => typeof entry.data().sentAt === 'number')
    .map((entry) => ({
      targetCharacterId: Number(entry.id),
      targetName: String(entry.data().targetName ?? ''),
      sentAt: Number(entry.data().sentAt),
    }))
    .sort((a, b) => b.sentAt - a.sentAt);
  return { remaining: Math.max(0, MAX_MAIL_INVITES_PER_DAY - used), sent };
}

export function createCommunity(characterId: number, name: string, characterName: string) {
  return call<{ name: string; characterName: string }, { communityId: string; inviteCode: string }>(
    characterId,
    'createCommunityCallable',
    { name, characterName }
  );
}

export async function leaveCommunity(characterId: number, communityId: string): Promise<void> {
  await call(characterId, 'leaveCommunityCallable', { communityId });
}

export async function deleteCommunity(characterId: number, communityId: string): Promise<void> {
  await call(characterId, 'deleteCommunityCallable', { communityId });
}

export async function revokeInvite(characterId: number, communityId: string): Promise<void> {
  await call(characterId, 'revokeCommunityInviteCallable', { communityId });
}

export function regenerateInvite(characterId: number, communityId: string) {
  return call<{ communityId: string }, { inviteCode: string }>(
    characterId,
    'regenerateCommunityInviteCallable',
    { communityId }
  );
}

export async function removeMember(
  characterId: number,
  communityId: string,
  memberUid: string
): Promise<void> {
  await call(characterId, 'removeCommunityMemberCallable', { communityId, memberUid });
}

export async function transferAdmin(
  characterId: number,
  communityId: string,
  memberUid: string
): Promise<void> {
  await call(characterId, 'transferCommunityAdminCallable', { communityId, memberUid });
}
