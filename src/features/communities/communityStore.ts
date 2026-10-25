/**
 * Communities client (issue #3597, ADR 0018): reads through Firestore under
 * the membership rules, every write through the Community callables
 * (functions/src/communities*.ts), which enforce the caps and the
 * delete-on-leave. The list of a Character's Communities comes from its own
 * membership index, because `communities` itself cannot be listed. Firestore
 * here is the `lite` build (no listeners), so callers refetch after a change.
 */
import type { CallableAction } from '../../../functions/src/callableManifest';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore/lite';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { SharedBlueprint } from '@/engine/communities/sharedLibrary';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { callRouted } from '@/sync/routedCallable';
import { createReadCache, dropCached } from './readCache';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import {
  communityBackendOverride,
  setCommunityBackendOverride,
  type CommunityBackendOverride,
} from './backendOverride';

export interface CommunitySummary {
  id: string;
  name: string;
  adminUid: string;
  /** Null once the admin has revoked the link. */
  inviteCode: string | null;
  memberCount: number;
  /** The admin lets each new Member in by hand, even one holding the link. Absent means off. */
  requireApproval?: boolean;
}

/** A Character waiting for the admin to let it in. */
export interface JoinRequest {
  uid: string;
  characterName: string;
  requestedAt: number;
}

export interface CommunityMember {
  uid: string;
  characterName: string;
  joinedAt: number;
  /** When the Member's Shared Blueprints were last refreshed; null when it shares none. */
  libraryAsOf: number | null;
}

export { setCommunityBackendOverride, type CommunityBackendOverride };

/** Where an invite link lands. The join page is its own ticket; this is its one address. */
export function communityInviteUrl(inviteCode: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/communities/join/${inviteCode}`;
}

/** Where a Pledge mail sends the requester: the Community's Requests tab (a Member signs in first, as for any page). */
export function communityRequestsUrl(communityId: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/communities?community=${encodeURIComponent(communityId)}&tab=requests`;
}

/** The in-app path to one Request on a Community's board: the Requests tab with its panel open. */
export function communityRequestPath(communityId: string, requestId: string): string {
  return `/communities?community=${encodeURIComponent(communityId)}&tab=requests&request=${encodeURIComponent(requestId)}`;
}

export function isCommunityAdmin(community: CommunitySummary, characterId: number): boolean {
  return community.adminUid === uidForCharacter(characterId);
}

/** The Communities a Character belongs to, from its own membership index. */
export async function listCommunityIds(characterId: number): Promise<string[]> {
  const uid = await ensureSignedIn(characterId);
  const index = await getDocs(collection(getSyncFirestore(), 'characters', uid, 'communities'));
  return index.docs.map((entry) => entry.id);
}

/**
 * How long `loadMyCommunitiesCached` reuses a Character's list. Reading it is one
 * query plus one read per Community, and the background readers (the request
 * badge, the Community alerts) would otherwise pay that on every tick. This
 * device's own joins, leaves and admin changes invalidate it at once; what
 * changes elsewhere (an admin letting this Character in, another Member joining)
 * shows within this window.
 */
export const MY_COMMUNITIES_TTL_MS = 15 * 60_000;

const mineCache = createReadCache<CommunitySummary[]>();

/**
 * How long `loadCommunityMembersCached` reuses a Community's roster. A roster changes when
 * someone joins or leaves, or pushes a library (its `pushedAt`); the libraries themselves are
 * re-read only when that stamp moves (`loadMemberLibrariesFor`).
 */
export const ROSTER_TTL_MS = 20 * 60_000;

const rosterCache = createReadCache<CommunityMember[]>();
/** Stamped with the Member's `libraryAsOf`: the same stamp is the same library. */
const libraryCache = createReadCache<SharedBlueprint[]>();

/**
 * Forget what is cached for one Character, or for all: its list of Communities and every
 * roster, library and shared Fitting list read through it (every `createReadCache`). After a change to its memberships, and whenever a
 * Community refused it (`withMyCommunities`).
 */
export function invalidateMyCommunities(characterId?: number): void {
  dropCached(characterId);
}

/** Forget one Community's roster for a Character: after it pushed its own library there. */
export function invalidateCommunityRoster(characterId: number, communityId: string): void {
  rosterCache.drop(`${characterId}:${communityId}:`);
}

const remember = (characterId: number, value: Promise<CommunitySummary[]>, at: number) =>
  mineCache.set(`${characterId}:`, at, value);

/**
 * The Character's Communities, reused for `MY_COMMUNITIES_TTL_MS`. Concurrent
 * callers share one read. For readers that can show a list up to that old;
 * the Communities page reads `loadMyCommunities`, which refreshes this too.
 */
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

/** Firestore refused a Member read: the Character is not (or no longer) a Member. */
export function isRefused(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'permission-denied';
}

/**
 * Runs `read` over the cached list. A Community this Character was removed from, or that was
 * deleted, elsewhere (no call on this device dropped the cache) refuses its Member reads: then
 * the cache is dropped and `read` runs once more over a fresh list, so one gone Community never
 * fails the whole read for the rest of the TTL.
 */
export async function withMyCommunities<T>(
  characterId: number,
  /** `retried`: this run is over the fresh list, after a refusal; a reader can stop rethrowing. */
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

/** The Character's Communities, read now (and remembered for `loadMyCommunitiesCached`). */
export async function loadMyCommunities(characterId: number): Promise<CommunitySummary[]> {
  const override = communityBackendOverride();
  if (override) return override.loadMine();
  return remember(characterId, readMyCommunities(characterId), Date.now());
}

async function readMyCommunities(characterId: number): Promise<CommunitySummary[]> {
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  const index = await getDocs(collection(db, 'characters', uid, 'communities'));
  const loaded = await Promise.all(
    index.docs.map(async (entry): Promise<CommunitySummary | null> => {
      const snap = await getDoc(doc(db, 'communities', entry.id));
      if (!snap.exists()) return null;
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

/** A Community's roster, read now (and remembered for `loadCommunityMembersCached`). */
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

/**
 * A Community's roster, reused for `ROSTER_TTL_MS`. Read it inside `withMyCommunities`, so a
 * Community that refuses this Character drops it along with the list.
 */
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

/** The Characters waiting to be let in. Readable by the admin only. */
export async function loadJoinRequests(
  characterId: number,
  communityId: string
): Promise<JoinRequest[]> {
  const override = communityBackendOverride();
  if (override) return override.loadRequests(communityId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    collection(getSyncFirestore(), 'communities', communityId, 'requests')
  );
  return snap.docs
    .map((entry) => ({
      uid: entry.id,
      characterName: String(entry.data().characterName ?? ''),
      requestedAt: Number(entry.data().requestedAt ?? 0),
    }))
    .sort((a, b) => a.requestedAt - b.requestedAt);
}

/** Every listed Member's shared blueprints, for the Community Library. A Member with none yields an empty list. */
export async function loadMemberLibraries(
  characterId: number,
  communityId: string,
  memberUids: readonly string[],
  /** `strict`: an unreadable library throws instead of reading as empty (a caller that must tell "none" from "could not read"). */
  { strict = false }: { strict?: boolean } = {}
): Promise<MemberLibrary[]> {
  const { libraries } = await readMemberLibraries(characterId, communityId, memberUids, strict);
  return libraries;
}

/**
 * The listed Members' shared blueprints, from their roster entries: a Member whose
 * `libraryAsOf` is null shares nothing and is not read at all, and one whose stamp is the
 * one already read comes from memory. An unreadable Member reads empty and is named in
 * `failedUids`; with `strict`, its failure throws instead.
 */
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
  const db = getSyncFirestore();
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
        // Refused: this Character is no longer a Member, so nothing it holds for it is current,
        // and the caller (inside `withMyCommunities`) reads its list again.
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
  const db = getSyncFirestore();
  const failedUids: string[] = [];
  const libraries = await Promise.all(
    memberUids.map(async (uid) => {
      // One unreadable Member (just removed, say) must not blank everyone else's column.
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

/** The pushed-at stamp, only while the Member shares anything (a cleared library has chunkCount 0). */
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
    return await callRouted<In, Out>(name, data);
  } finally {
    // Even a failed call may have landed (a timeout after the write).
    if (CHANGES_MY_COMMUNITIES.has(name)) invalidateMyCommunities(characterId);
  }
}

/** The calls that change a Character's Communities or what their summaries show. */
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

/** The invite page's preview. Needs no session: a visitor has not signed in yet. */
export async function previewInvite(inviteCode: string): Promise<InvitePreview> {
  return callRouted<{ inviteCode: string }, InvitePreview>('previewCommunityCallable', {
    inviteCode,
  });
}

export function joinCommunity(characterId: number, inviteCode: string, characterName: string) {
  return callCommunity<
    { inviteCode: string; characterName: string },
    { communityId: string; alreadyMember: boolean; pending?: boolean }
  >(characterId, 'joinCommunityCallable', { inviteCode, characterName });
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

/** Claims a daily mail invite and the one-per-target slot; the server holds the cap. */
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

/** Gives the reserved slot back after a failed send. */
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
/** How many sent mail invites the panel lists, newest first. */
export const MAIL_INVITES_SHOWN = 50;

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
  if (communityBackendOverride()) return { remaining: MAX_MAIL_INVITES_PER_DAY, sent: [] };
  const uid = await ensureSignedIn(characterId);
  const db = getSyncFirestore();
  const day = new Date(now).toISOString().slice(0, 10);
  const [quota, invites] = await Promise.all([
    getDoc(doc(db, 'characters', uid, 'mailInviteQuota', day)),
    // The newest sent ones only: the list shows recent invites, and the daily cap is 20.
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

export function createCommunity(characterId: number, name: string, characterName: string) {
  return callCommunity<
    { name: string; characterName: string },
    { communityId: string; inviteCode: string }
  >(characterId, 'createCommunityCallable', { name, characterName });
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
