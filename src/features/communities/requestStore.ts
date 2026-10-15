/**
 * Community Requests client (issue #3807, ADR 0021): the board reads through
 * Firestore under the membership rules; posting, extending, closing and
 * reopening go through the Request callables, which hold the caps. Pledges
 * (issue #3808) are the Member's own documents, written here directly under
 * the rules. Firestore here is the `lite` build (no listeners), so callers
 * refetch after a change.
 */
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore/lite';
import { db as localDb } from '@/db';
import type {
  CommunityRequest,
  PledgeEntry,
  RequestLine,
  RequestLineKind,
  RequestPledge,
} from '@/engine/communities/requests';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { callCommunity } from './communityStore';

const KINDS: readonly RequestLineKind[] = ['item', 'bpc', 'bpo'];

function readLine(raw: unknown): RequestLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const kind = KINDS.find((k) => k === d.kind) ?? 'item';
  if (typeof d.typeId !== 'number' || typeof d.quantity !== 'number') return null;
  const line: RequestLine = {
    typeId: d.typeId,
    name: String(d.name ?? ''),
    quantity: d.quantity,
    kind,
  };
  if (typeof d.runs === 'number') line.runs = d.runs;
  if (typeof d.me === 'number') line.me = d.me;
  if (typeof d.te === 'number') line.te = d.te;
  return line;
}

/** Every Request on a Community's board, newest first. A document that does not read as a Request is skipped. */
export async function loadRequests(
  characterId: number,
  communityId: string
): Promise<CommunityRequest[]> {
  const override = communityBackendOverride();
  if (override?.loadItemRequests) return override.loadItemRequests(communityId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    collection(getSyncFirestore(), 'communities', communityId, 'itemRequests')
  );
  return snap.docs
    .map((entry): CommunityRequest | null => {
      const d = entry.data();
      const lines = (Array.isArray(d.lines) ? d.lines : [])
        .map(readLine)
        .filter((line): line is RequestLine => line !== null);
      if (lines.length === 0) return null;
      return {
        id: entry.id,
        ownerUid: String(d.ownerUid ?? ''),
        ownerName: String(d.ownerName ?? ''),
        location: String(d.location ?? ''),
        terms: String(d.terms ?? ''),
        lines,
        createdAt: Number(d.createdAt ?? 0),
        lastActivityAt: Number(d.lastActivityAt ?? 0),
        expiresAt: Number(d.expiresAt ?? 0),
        closed: d.closed === true,
      };
    })
    .filter((request): request is CommunityRequest => request !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface PostRequestDraft {
  location: string;
  terms: string;
  lines: RequestLine[];
}

export function postRequest(characterId: number, communityId: string, draft: PostRequestDraft) {
  return callCommunity<PostRequestDraft & { communityId: string }, { requestId: string }>(
    characterId,
    'postCommunityRequestCallable',
    { communityId, ...draft }
  );
}

export function extendRequest(characterId: number, communityId: string, requestId: string) {
  return callCommunity<{ communityId: string; requestId: string }, { expiresAt: number }>(
    characterId,
    'extendCommunityRequestCallable',
    { communityId, requestId }
  );
}

/** Close a Request, or reopen a closed one. */
export async function setRequestClosed(
  characterId: number,
  communityId: string,
  requestId: string,
  closed: boolean
): Promise<void> {
  await callCommunity(characterId, 'setCommunityRequestClosedCallable', {
    communityId,
    requestId,
    closed,
  });
}

type PledgeLines = RequestPledge['lines'];

/** A Pledge document as stored: the lines keyed by index. Null when it does not read as one. */
function readPledge(uid: string, d: Record<string, unknown>): RequestPledge | null {
  if (typeof d.lines !== 'object' || d.lines === null) return null;
  const lines: Record<number, PledgeEntry> = {};
  for (const [key, raw] of Object.entries(d.lines as Record<string, unknown>)) {
    const index = Number(key);
    const e = raw as Record<string, unknown> | null;
    if (!Number.isInteger(index) || typeof e !== 'object' || e === null) continue;
    if (typeof e.quantity !== 'number') continue;
    lines[index] = {
      quantity: e.quantity,
      delivered: typeof e.delivered === 'number' ? e.delivered : 0,
      contractIds: Array.isArray(e.contractIds)
        ? e.contractIds.filter((id): id is number => typeof id === 'number')
        : [],
    };
  }
  const stamp = d.updatedAt as { toMillis?: () => number } | undefined;
  return { uid, lines, updatedAt: stamp?.toMillis?.() ?? 0 };
}

/** Every Member's Pledges on one Request. */
export async function loadPledges(
  characterId: number,
  communityId: string,
  requestId: string
): Promise<RequestPledge[]> {
  const override = communityBackendOverride();
  if (override?.loadPledges) return override.loadPledges(communityId, requestId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    collection(getSyncFirestore(), 'communities', communityId, 'itemRequests', requestId, 'pledges')
  );
  return snap.docs
    .map((entry) => readPledge(entry.id, entry.data()))
    .filter((pledge): pledge is RequestPledge => pledge !== null);
}

/**
 * Every Pledge in a Community, by Request id, in ONE collection-group query on
 * `pledges` filtered by `communityId` (each Pledge repeats its Community, and
 * the rules bind that field to its path). Needs the collection-group index
 * and rule in firestore.indexes.json / firestore.rules to be deployed.
 */
export async function loadCommunityPledges(
  characterId: number,
  communityId: string
): Promise<Map<string, RequestPledge[]>> {
  const found = new Map<string, RequestPledge[]>();
  const override = communityBackendOverride();
  if (override?.loadAllPledges) {
    for (const [requestId, list] of Object.entries(override.loadAllPledges(communityId))) {
      found.set(requestId, list);
    }
    return found;
  }
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(collectionGroup(getSyncFirestore(), 'pledges'), where('communityId', '==', communityId))
  );
  for (const entry of snap.docs) {
    const requestId = entry.ref.parent.parent?.id;
    const pledge = readPledge(entry.id, entry.data());
    if (!requestId || !pledge) continue;
    found.set(requestId, [...(found.get(requestId) ?? []), pledge]);
  }
  return found;
}

/**
 * Rewrites this Character's Pledge on one Request: reads the stored document
 * first (so a delivery marked from another device is kept), applies `change`,
 * then writes it, or deletes it when no line is left. Returns the new Pledge,
 * null when withdrawn.
 */
export async function updateMyPledge(
  characterId: number,
  communityId: string,
  requestId: string,
  change: (lines: PledgeLines) => PledgeLines
): Promise<RequestPledge | null> {
  const uid = uidForCharacter(characterId);
  const override = communityBackendOverride();
  if (override?.loadPledges && override.savePledge) {
    const mine = override.loadPledges(communityId, requestId).find((p) => p.uid === uid);
    const next = change(mine?.lines ?? {});
    override.savePledge(communityId, requestId, Object.keys(next).length === 0 ? null : next);
    return override.loadPledges(communityId, requestId).find((p) => p.uid === uid) ?? null;
  }
  await ensureSignedIn(characterId);
  const ownerHash = (await localDb.characters.get(characterId))?.ownerHash;
  if (!ownerHash) throw new Error('This Character has no owner hash yet');
  const ref = doc(
    getSyncFirestore(),
    'communities',
    communityId,
    'itemRequests',
    requestId,
    'pledges',
    uid
  );
  const stored = await getDoc(ref);
  const before = stored.exists() ? readPledge(uid, stored.data()) : null;
  const next = change(before?.lines ?? {});
  if (Object.keys(next).length === 0) {
    await deleteDoc(ref);
    return null;
  }
  const lines: Record<string, { quantity: number; delivered: number; contractIds: number[] }> = {};
  for (const [index, entry] of Object.entries(next)) {
    lines[index] = {
      quantity: entry.quantity,
      delivered: entry.delivered,
      contractIds: [...(entry.contractIds ?? [])],
    };
  }
  await setDoc(ref, { ownerHash, communityId, lines, updatedAt: serverTimestamp() });
  return readPledge(uid, (await getDoc(ref)).data() ?? {});
}

export interface RequestMailTarget {
  communityId: string;
  requestId: string;
  targetCharacterId: number;
  targetName: string;
}

export interface RequestMailReservation {
  communityName: string;
  requesterName: string;
  /** Request mails left today after this one. */
  remaining: number;
}

/** Claims one of the day's Request mails and the one-per-recipient slot; the server holds the cap. */
export function reserveRequestMail(characterId: number, target: RequestMailTarget) {
  return callCommunity<RequestMailTarget, RequestMailReservation>(
    characterId,
    'reserveCommunityRequestMailCallable',
    target
  );
}

/** The mail went out: stamps it. */
export async function confirmRequestMail(
  characterId: number,
  target: RequestMailTarget
): Promise<void> {
  await callCommunity(characterId, 'confirmCommunityRequestMailCallable', target);
}

/** Gives the reserved slot back after a send ESI refused. */
export async function releaseRequestMail(
  characterId: number,
  target: RequestMailTarget
): Promise<void> {
  await callCommunity(characterId, 'releaseCommunityRequestMailCallable', target);
}

/** Request mails this Character has sent today (UTC): a convenience, the server holds the cap. */
export async function loadRequestMailsToday(
  characterId: number,
  now = Date.now()
): Promise<number> {
  const override = communityBackendOverride();
  if (override) return override.loadRequestMailsToday?.() ?? 0;
  const uid = await ensureSignedIn(characterId);
  const day = new Date(now).toISOString().slice(0, 10);
  const snap = await getDoc(doc(getSyncFirestore(), 'characters', uid, 'requestMailQuota', day));
  return Number(snap.exists() ? (snap.data().count ?? 0) : 0);
}
