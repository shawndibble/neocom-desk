import type { CallableAction } from '../../../functions/src/callableManifest';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore/lite';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { SharedBlueprint } from '@/engine/communities/sharedLibrary';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { callRouted } from '@/sync/routedCallable';
import { createReadCache, dropCached } from './readCache';
import { ensureSignedIn } from '@/sync/syncAuth';
import {
  clearNotFound,
  isKnownMissing,
  rememberMissing,
  NOT_FOUND_TTL_MS,
} from '@/sync/notFoundCache';
import { uidForCharacter } from '@/sync/uid';
import {
  communityBackendOverride,
  setCommunityBackendOverride,
  type CommunityBackendOverride,
} from './backendOverride';
import { utcDay } from '@/engine/localDay';
import { MINUTE_MS } from '@/lib/age';

export interface CommunitySummary {
  id: string;
  name: string;
  adminUid: string;
  inviteCode: string | null;
  memberCount: number;
  requireApproval?: boolean;
}

export interface JoinRequest {
  uid: string;
  characterName: string;
  requestedAt: number;
}

export interface CommunityMember {
  uid: string;
  characterName: string;
  joinedAt: number;
  libraryAsOf: number | null;
}

export { setCommunityBackendOverride, type CommunityBackendOverride };

export function communityInviteUrl(inviteCode: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/communities/join/${inviteCode}`;
}

export function communityRequestsUrl(communityId: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/communities?community=${encodeURIComponent(communityId)}&tab=requests`;
}

export function communityRequestPath(communityId: string, requestId: string): string {
  return `/communities?community=${encodeURIComponent(communityId)}&tab=requests&request=${encodeURIComponent(requestId)}`;
}

export function isCommunityAdmin(community: CommunitySummary, characterId: number): boolean {
  return community.adminUid === uidForCharacter(characterId);
}

export async function listCommunityIds(characterId: number): Promise<string[]> {
  const uid = await ensureSignedIn(characterId);
  const index = await getDocs(
    collection(getSyncFirestore(characterId), 'characters', uid, 'communities')
  );
  return index.docs.map((entry) => entry.id);
}

export const MY_COMMUNITIES_TTL_MS = 15 * MINUTE_MS;

const mineCache = createReadCache<CommunitySummary[]>();

export const COMMUNITY_LIST_CAP = 1000;

export const ROSTER_TTL_MS = 20 * MINUTE_MS;

const rosterCache = createReadCache<CommunityMember[]>();
const libraryCache = createReadCache<SharedBlueprint[]>();

export function invalidateMyCommunities(characterId?: number): void {
  dropCached(characterId);
}

export function invalidateCommunityRoster(characterId: number, communityId: string): void {
  rosterCache.drop(`${characterId}:${communityId}:`);
}

const remember = (characterId: number, value: Promise<CommunitySummary[]>, at: number) =>
  mineCache.set(`${characterId}:`, at, value);

export async function loadMyCommunitiesCached(
  characterId: number,
  now = Date.now()
): Promise<CommunitySummary[]> {
  const override = communityBackendOverride();
  if (override) return override.loadMine();
  const held = mineCache.get(`${characterId}:`, (at) => now - at < MY_COMMUNITIES_TTL_MS);
  if (held) return held;
  return remember(characterId, readMyCommunities(characterId), now);
}

export function isRefused(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'permission-denied';
}

export async function withMyCommunities<T>(
  characterId: number,
  read: (communities: CommunitySummary[], attempt: { retried: boolean }) => Promise<T>,
  now = Date.now()
): Promise<T> {
  const cached = await loadMyCommunitiesCached(characterId, now);
  try {
    return await read(cached, { retried: false });
  } catch (err) {
    if (!isRefused(err)) throw err;
    invalidateMyCommunities(characterId);
    return read(await loadMyCommunities(characterId), { retried: true });
  }
}

export async function loadMyCommunities(characterId: number): Promise<CommunitySummary[]> {
  const override = communityBackendOverride();
  if (override) return override.loadMine();
  return remember(characterId, readMyCommunities(characterId), Date.now());
}

async function readMyCommunities(characterId: number): Promise<CommunitySummary[]> {
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const index = await getDocs(collection(db, 'characters', uid, 'communities'));
  const loaded = await Promise.all(
    index.docs.map(async (entry): Promise<CommunitySummary | null> => {
      const path = `communities/${entry.id}`;
      if (await isKnownMissing(path)) return null;
      const snap = await getDoc(doc(db, 'communities', entry.id));
      if (!snap.exists()) {
        await rememberMissing(path, NOT_FOUND_TTL_MS.community);
        return null;
      }
      const data = snap.data();
      return {
        id: snap.id,
        name: String(data.name ?? ''),
        adminUid: String(data.adminUid ?? ''),
        inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : null,
        memberCount: Number(data.memberCount ?? 0),
        requireApproval: data.requireApproval === true,
      };
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
  const override = communityBackendOverride();
  if (override) return override.loadMembers(communityId);
  return rosterCache.set(
    `${characterId}:${communityId}:`,
    Date.now(),
    readCommunityMembers(characterId, communityId)
  );
}

export async function loadCommunityMembersCached(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<CommunityMember[]> {
  const override = communityBackendOverride();
  if (override) return override.loadMembers(communityId);
  const key = `${characterId}:${communityId}:`;
  return (
    rosterCache.get(key, (at) => now - at < ROSTER_TTL_MS) ??
    rosterCache.set(key, now, readCommunityMembers(characterId, communityId))
  );
}

async function readCommunityMembers(
  characterId: number,
  communityId: string
): Promise<CommunityMember[]> {
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(
      collection(getSyncFirestore(characterId), 'communities', communityId, 'members'),
      limit(COMMUNITY_LIST_CAP)
    )
  );
  return snap.docs
    .map((entry) => ({
      uid: entry.id,
      characterName: String(entry.data().characterName ?? ''),
      joinedAt: Number(entry.data().joinedAt ?? 0),
      libraryAsOf: libraryAsOf(entry.data()),
    }))
    .sort((a, b) => a.characterName.localeCompare(b.characterName));
}

export async function loadJoinRequests(
  characterId: number,
  communityId: string
): Promise<JoinRequest[]> {
  const override = communityBackendOverride();
  if (override) return override.loadRequests(communityId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(
      collection(getSyncFirestore(characterId), 'communities', communityId, 'requests'),
      limit(COMMUNITY_LIST_CAP)
    )
  );
  return snap.docs
    .map((entry) => ({
      uid: entry.id,
      characterName: String(entry.data().characterName ?? ''),
      requestedAt: Number(entry.data().requestedAt ?? 0),
    }))
    .sort((a, b) => a.requestedAt - b.requestedAt);
}

export async function loadMemberLibraries(
  characterId: number,
  communityId: string,
  memberUids: readonly string[],
  { strict = false }: { strict?: boolean } = {}
): Promise<MemberLibrary[]> {
  const { libraries } = await readMemberLibraries(characterId, communityId, memberUids, strict);
  return libraries;
}

export async function loadMemberLibrariesFor(
  characterId: number,
  communityId: string,
  members: readonly Pick<CommunityMember, 'uid' | 'libraryAsOf'>[],
  { strict = false }: { strict?: boolean } = {}
): Promise<{ libraries: MemberLibrary[]; failedUids: string[] }> {
  if (communityBackendOverride()?.loadLibraries) {
    return readMemberLibraries(
      characterId,
      communityId,
      members.map((m) => m.uid),
      strict
    );
  }
  const db = getSyncFirestore(characterId);
  const failedUids: string[] = [];
  const libraries = await Promise.all(
    members.map(async ({ uid, libraryAsOf: asOf }): Promise<MemberLibrary> => {
      if (asOf === null) return { uid, items: [] };
      const key = `${characterId}:${communityId}:${uid}`;
      try {
        const items =
          libraryCache.get(key, (stamp) => stamp === asOf) ??
          libraryCache.set(
            key,
            asOf,
            ensureSignedIn(characterId).then(() => readLibrary(db, communityId, uid))
          );
        return { uid, items: await items };
      } catch (err) {
        if (isRefused(err)) {
          invalidateMyCommunities(characterId);
          throw err;
        }
        if (strict) throw err;
        failedUids.push(uid);
        return { uid, items: [] };
      }
    })
  );
  return { libraries, failedUids };
}

async function readLibrary(
  db: ReturnType<typeof getSyncFirestore>,
  communityId: string,
  uid: string
): Promise<SharedBlueprint[]> {
  const chunks = await getDocs(
    collection(db, 'communities', communityId, 'members', uid, 'library')
  );
  return chunks.docs.flatMap((chunk) => {
    const list = chunk.data().items;
    return Array.isArray(list) ? (list as SharedBlueprint[]) : [];
  });
}

async function readMemberLibraries(
  characterId: number,
  communityId: string,
  memberUids: readonly string[],
  strict: boolean
): Promise<{ libraries: MemberLibrary[]; failedUids: string[] }> {
  const standIn = communityBackendOverride()?.loadLibraries;
  if (standIn) {
    const libraries = standIn(communityId);
    return {
      libraries: memberUids.map(
        (uid) => libraries.find((library) => library.uid === uid) ?? { uid, items: [] }
      ),
      failedUids: [],
    };
  }
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const failedUids: string[] = [];
  const libraries = await Promise.all(
    memberUids.map(async (uid) => {
      try {
        return { uid, items: await readLibrary(db, communityId, uid) };
      } catch (err) {
        if (strict) throw err;
        failedUids.push(uid);
        return { uid, items: [] };
      }
    })
  );
  return { libraries, failedUids };
}

function libraryAsOf(data: Record<string, unknown>): number | null {
  const stamp = data.pushedAt as { toMillis?: () => number } | undefined;
  if (!stamp?.toMillis || !Number(data.chunkCount ?? 0)) return null;
  return stamp.toMillis();
}

export async function callCommunity<In, Out>(
  characterId: number,
  name: CallableAction,
  data: In
): Promise<Out> {
  const override = communityBackendOverride();
  if (override) return override.call(name, data) as Out;
  await ensureSignedIn(characterId);
  try {
    return await callRouted<In, Out>(name, data, characterId);
  } finally {
    if (CHANGES_MY_COMMUNITIES.has(name)) invalidateMyCommunities(characterId);
  }
}

const CHANGES_MY_COMMUNITIES: ReadonlySet<CallableAction> = new Set<CallableAction>([
  'createCommunityCallable',
  'joinCommunityCallable',
  'leaveCommunityCallable',
  'deleteCommunityCallable',
  'removeCommunityMemberCallable',
  'transferCommunityAdminCallable',
  'setCommunityApprovalCallable',
  'decideCommunityJoinRequestCallable',
  'revokeCommunityInviteCallable',
  'regenerateCommunityInviteCallable',
]);

export interface InvitePreview {
  name: string;
  adminName: string;
  memberCount: number;
}

export async function previewInvite(inviteCode: string): Promise<InvitePreview> {
  return callRouted<{ inviteCode: string }, InvitePreview>(
    'previewCommunityCallable',
    {
      inviteCode,
    },
    undefined
  );
}

export async function joinCommunity(
  characterId: number,
  inviteCode: string,
  characterName: string
) {
  const joined = await callCommunity<
    { inviteCode: string; characterName: string },
    { communityId: string; alreadyMember: boolean; pending?: boolean }
  >(characterId, 'joinCommunityCallable', { inviteCode, characterName });
  await clearNotFound(`communities/${joined.communityId}`);
  return joined;
}

export async function setRequireApproval(
  characterId: number,
  communityId: string,
  requireApproval: boolean
): Promise<void> {
  await callCommunity(characterId, 'setCommunityApprovalCallable', {
    communityId,
    requireApproval,
  });
}

export interface CommunityPopSharer {
  corporationId: number;
  sharing: boolean;
  blocked: boolean;
}

export async function listCommunityPopSharers(
  characterId: number,
  communityId: string
): Promise<CommunityPopSharer[]> {
  const result = await callCommunity<{ communityId: string }, { sharers?: CommunityPopSharer[] }>(
    characterId,
    'listCommunityPopSharersCallable',
    { communityId }
  );
  return result.sharers ?? [];
}

export async function setCommunityPopSharingBlock(
  characterId: number,
  communityId: string,
  corporationId: number,
  blocked: boolean
): Promise<void> {
  await callCommunity(characterId, 'setCommunityPopSharingBlockCallable', {
    communityId,
    corporationId,
    blocked,
  });
}

export async function decideJoinRequest(
  characterId: number,
  communityId: string,
  memberUid: string,
  accept: boolean
): Promise<void> {
  await callCommunity(characterId, 'decideCommunityJoinRequestCallable', {
    communityId,
    memberUid,
    accept,
  });
}

export interface MailInviteReservation {
  inviteCode: string;
  communityName: string;
  adminName: string;
  remaining: number;
}

export function reserveMailInvite(
  characterId: number,
  communityId: string,
  targetCharacterId: number,
  targetName: string
) {
  return callCommunity<
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
  await callCommunity(characterId, 'confirmCommunityMailInviteCallable', {
    communityId,
    targetCharacterId,
    targetName,
  });
}

export async function releaseMailInvite(
  characterId: number,
  communityId: string,
  targetCharacterId: number,
  targetName: string
): Promise<void> {
  await callCommunity(characterId, 'releaseCommunityMailInviteCallable', {
    communityId,
    targetCharacterId,
    targetName,
  });
}

export const MAX_MAIL_INVITES_PER_DAY = 20;
export const MAIL_INVITES_SHOWN = 50;

export interface SentMailInvite {
  targetCharacterId: number;
  targetName: string;
  sentAt: number;
}

export async function loadMailInviteStatus(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<{ remaining: number; sent: SentMailInvite[] }> {
  if (communityBackendOverride()) return { remaining: MAX_MAIL_INVITES_PER_DAY, sent: [] };
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const day = utcDay(now);
  const [quota, invites] = await Promise.all([
    getDoc(doc(db, 'characters', uid, 'mailInviteQuota', day)),
    getDocs(
      query(
        collection(db, 'communities', communityId, 'mailInvites'),
        orderBy('sentAt', 'desc'),
        limit(MAIL_INVITES_SHOWN)
      )
    ),
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

export async function createCommunity(characterId: number, name: string, characterName: string) {
  const created = await callCommunity<
    { name: string; characterName: string },
    { communityId: string; inviteCode: string }
  >(characterId, 'createCommunityCallable', { name, characterName });
  await clearNotFound(`communities/${created.communityId}`);
  return created;
}

export async function leaveCommunity(characterId: number, communityId: string): Promise<void> {
  await callCommunity(characterId, 'leaveCommunityCallable', { communityId });
}

export async function deleteCommunity(characterId: number, communityId: string): Promise<void> {
  await callCommunity(characterId, 'deleteCommunityCallable', { communityId });
}

export async function revokeInvite(characterId: number, communityId: string): Promise<void> {
  await callCommunity(characterId, 'revokeCommunityInviteCallable', { communityId });
}

export function regenerateInvite(characterId: number, communityId: string) {
  return callCommunity<{ communityId: string }, { inviteCode: string }>(
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
  await callCommunity(characterId, 'removeCommunityMemberCallable', { communityId, memberUid });
}

export async function transferAdmin(
  characterId: number,
  communityId: string,
  memberUid: string
): Promise<void> {
  await callCommunity(characterId, 'transferCommunityAdminCallable', { communityId, memberUid });
}
