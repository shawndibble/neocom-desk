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
  runTransaction,
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
  RequestNotify,
  RequestPledge,
} from '@/engine/communities/requests';
import { readNotify, readStanding } from '@/engine/communities/requests';
import { readQuote, type HeldQuote, type StandingRequest } from '@/engine/communities/buyback';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { callCommunity } from './communityStore';
import { trackPledgeWrite, underFirebaseSession } from './pledgeWrites';

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

function readRequest(id: string, d: Record<string, unknown>): CommunityRequest | null {
  const lines = (Array.isArray(d.lines) ? d.lines : [])
    .map(readLine)
    .filter((line): line is RequestLine => line !== null);
  const standing = readStanding(d);
  // A standing Request asks through its buy lines and carries no item lines.
  if (lines.length === 0 && !standing) return null;
  return {
    id,
    ownerUid: String(d.ownerUid ?? ''),
    ownerName: String(d.ownerName ?? ''),
    location: String(d.location ?? ''),
    terms: String(d.terms ?? ''),
    lines,
    createdAt: Number(d.createdAt ?? 0),
    lastActivityAt: Number(d.lastActivityAt ?? 0),
    expiresAt: Number(d.expiresAt ?? 0),
    closed: d.closed === true,
    notify: readNotify(d.notify),
    ...(standing ? { standing } : {}),
  };
}

/** Every Request on a Community's board, newest first. A document that does not read as a Request is skipped. */
export async function loadRequests(
  characterId: number,
  communityId: string
): Promise<CommunityRequest[]> {
  const override = communityBackendOverride();
  if (override?.loadItemRequests) return override.loadItemRequests(communityId);
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(collection(getSyncFirestore(), 'communities', communityId, 'itemRequests'));
  });
  return snap.docs
    .map((entry) => readRequest(entry.id, entry.data()))
    .filter((request): request is CommunityRequest => request !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Only this Member's own Requests in a Community: one single-field query on
 * `ownerUid` (no composite index), a few documents instead of the whole board.
 */
export async function loadMyRequests(
  characterId: number,
  communityId: string
): Promise<CommunityRequest[]> {
  const myUid = uidForCharacter(characterId);
  const override = communityBackendOverride();
  if (override?.loadItemRequests) {
    return override.loadItemRequests(communityId).filter((request) => request.ownerUid === myUid);
  }
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      query(
        collection(getSyncFirestore(), 'communities', communityId, 'itemRequests'),
        where('ownerUid', '==', myUid)
      )
    );
  });
  return snap.docs
    .map((entry) => readRequest(entry.id, entry.data()))
    .filter((request): request is CommunityRequest => request !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface PostRequestDraft {
  location: string;
  terms: string;
  lines: RequestLine[];
  notify: RequestNotify;
  /** Present on a standing buyback Request: the rate, hub, buyer and what it buys. */
  standing?: StandingRequest;
}

/** The callable's flat shape: a standing draft sends `standing: true` beside its terms. */
function draftPayload({ standing, ...draft }: PostRequestDraft) {
  if (!standing) return draft;
  const { buyerCharacterId, ...terms } = standing;
  return {
    ...draft,
    standing: true,
    ...terms,
    ...(buyerCharacterId !== null ? { buyerCharacterId } : {}),
  };
}

export function postRequest(characterId: number, communityId: string, draft: PostRequestDraft) {
  return callCommunity<Record<string, unknown>, { requestId: string }>(
    characterId,
    'postCommunityRequestCallable',
    { communityId, ...draftPayload(draft) }
  );
}

/** The requester edits their own Request (checked server side). */
export async function editRequest(
  characterId: number,
  communityId: string,
  requestId: string,
  draft: PostRequestDraft
): Promise<void> {
  await callCommunity(characterId, 'editCommunityRequestCallable', {
    communityId,
    requestId,
    ...draftPayload(draft),
  });
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

/** The Community admin removes any Request, with every Pledge on it (checked server side). */
export async function removeRequest(
  characterId: number,
  communityId: string,
  requestId: string
): Promise<void> {
  await callCommunity(characterId, 'removeCommunityRequestCallable', { communityId, requestId });
}

/** The Community admin removes one Member's Pledge on a Request (checked server side). */
export async function removePledge(
  characterId: number,
  communityId: string,
  requestId: string,
  pledgeUid: string
): Promise<void> {
  await callCommunity(characterId, 'removeCommunityPledgeCallable', {
    communityId,
    requestId,
    pledgeUid,
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
      ...(typeof e.manual === 'number' && e.manual > 0 ? { manual: e.manual } : {}),
      ...(typeof e.auto === 'number' && e.auto >= 0 ? { auto: e.auto } : {}),
      ...(typeof e.through === 'number' && e.through >= 0 ? { through: e.through } : {}),
    };
  }
  const stamp = d.updatedAt as { toMillis?: () => number } | undefined;
  const quote = readQuote(d.quote);
  return { uid, lines, ...(quote ? { quote } : {}), updatedAt: stamp?.toMillis?.() ?? 0 };
}

/** Every Member's Pledges on one Request. */
export async function loadPledges(
  characterId: number,
  communityId: string,
  requestId: string
): Promise<RequestPledge[]> {
  const override = communityBackendOverride();
  if (override?.loadPledges) return override.loadPledges(communityId, requestId);
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      collection(
        getSyncFirestore(),
        'communities',
        communityId,
        'itemRequests',
        requestId,
        'pledges'
      )
    );
  });
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
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      query(collectionGroup(getSyncFirestore(), 'pledges'), where('communityId', '==', communityId))
    );
  });
  for (const entry of snap.docs) {
    const requestId = entry.ref.parent.parent?.id;
    const pledge = readPledge(entry.id, entry.data());
    if (!requestId || !pledge) continue;
    found.set(requestId, [...(found.get(requestId) ?? []), pledge]);
  }
  return found;
}

/**
 * Rewrites this Character's Pledge on one Request: inside a transaction, reads
 * the stored document (so a delivery marked from another device, or a typed
 * amount saved a moment ago, is kept; a concurrent write makes it retry on the
 * fresh document), applies `change`, then writes it, or deletes it when no
 * line is left. Returns the new Pledge, null when withdrawn.
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
  return trackPledgeWrite(() =>
    underFirebaseSession(() => writeMyPledge(characterId, communityId, requestId, uid, change))
  );
}

async function writeMyPledge(
  characterId: number,
  communityId: string,
  requestId: string,
  uid: string,
  change: (lines: PledgeLines) => PledgeLines
): Promise<RequestPledge | null> {
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
  const withdrawn = await runTransaction(getSyncFirestore(), async (tx) => {
    const stored = await tx.get(ref);
    const before = stored.exists() ? readPledge(uid, stored.data()) : null;
    const next = change(before?.lines ?? {});
    if (Object.keys(next).length === 0) {
      tx.delete(ref);
      return true;
    }
    const lines: Record<
      string,
      {
        quantity: number;
        delivered: number;
        contractIds: number[];
        manual?: number;
        auto?: number;
        through?: number;
      }
    > = {};
    for (const [index, entry] of Object.entries(next)) {
      lines[index] = {
        quantity: entry.quantity,
        delivered: entry.delivered,
        contractIds: [...(entry.contractIds ?? [])],
        ...(entry.manual !== undefined ? { manual: entry.manual } : {}),
        ...(entry.auto !== undefined ? { auto: entry.auto } : {}),
        ...(entry.through !== undefined ? { through: entry.through } : {}),
      };
    }
    tx.set(ref, { ownerHash, communityId, lines, updatedAt: serverTimestamp() });
    return false;
  });
  if (withdrawn) return null;
  return readPledge(uid, (await getDoc(ref)).data() ?? {});
}

/**
 * Holds (or, with null, clears) this Character's Quote on a standing Request.
 * The Quote replaces any held one: one Quote per Member per Request. A standing
 * Request takes no line Pledges, so the document is the Quote and nothing else.
 */
export async function saveMyQuote(
  characterId: number,
  communityId: string,
  requestId: string,
  quote: HeldQuote | null
): Promise<RequestPledge | null> {
  const uid = uidForCharacter(characterId);
  const override = communityBackendOverride();
  if (override?.saveQuote && override.loadPledges) {
    override.saveQuote(communityId, requestId, quote);
    return override.loadPledges(communityId, requestId).find((p) => p.uid === uid) ?? null;
  }
  return trackPledgeWrite(() =>
    underFirebaseSession(async () => {
      await ensureSignedIn(characterId);
      const ref = doc(
        getSyncFirestore(),
        'communities',
        communityId,
        'itemRequests',
        requestId,
        'pledges',
        uid
      );
      if (quote === null) {
        await deleteDoc(ref);
        return null;
      }
      const ownerHash = (await localDb.characters.get(characterId))?.ownerHash;
      if (!ownerHash) throw new Error('This Character has no owner hash yet');
      await setDoc(ref, {
        ownerHash,
        communityId,
        lines: {},
        quote,
        updatedAt: serverTimestamp(),
      });
      return readPledge(uid, (await getDoc(ref)).data() ?? {});
    })
  );
}
