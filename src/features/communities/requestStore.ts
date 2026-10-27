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
  Timestamp,
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
import {
  readQuote,
  type HeldQuote,
  type QuoteLinkRef,
  type StandingRequest,
} from '@/engine/communities/buyback';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { isMissingIndex } from '@/sync/missingIndex';
import { ensureSignedIn } from '@/sync/syncAuth';
import { uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { callCommunity } from './communityStore';
import { underFirebaseSession } from './pledgeWrites';

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
    return getDocs(
      collection(getSyncFirestore(characterId), 'communities', communityId, 'itemRequests')
    );
  });
  return snap.docs
    .map((entry) => readRequest(entry.id, entry.data()))
    .filter((request): request is CommunityRequest => request !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The Requests posted after `since` (epoch ms), newest first: what the nav badge
 * counts. A single-field range on `createdAt` (an automatic index), so a tick with
 * nothing new is one read rather than the whole board. Until an index exists it
 * reads the board and filters it, as before.
 */
export async function loadRequestsSince(
  characterId: number,
  communityId: string,
  since: number
): Promise<CommunityRequest[]> {
  const override = communityBackendOverride();
  if (override?.loadItemRequests) {
    return override.loadItemRequests(communityId).filter((request) => request.createdAt > since);
  }
  let snap;
  try {
    snap = await underFirebaseSession(async () => {
      await ensureSignedIn(characterId);
      return getDocs(
        query(
          collection(getSyncFirestore(characterId), 'communities', communityId, 'itemRequests'),
          where('createdAt', '>', since)
        )
      );
    });
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
    return (await loadRequests(characterId, communityId)).filter((r) => r.createdAt > since);
  }
  return snap.docs
    .map((entry) => readRequest(entry.id, entry.data()))
    .filter((request): request is CommunityRequest => request !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The board's version stamp (issue #5244): `communities/{id}/boardVersion/current`, one read. `stamp`
 * moves on every write to a Request or Pledge, `reset` only on one that deletes (a delta cannot show
 * a deletion). A board with no stamp yet reads 0 / 0. Null under a backend override: no cache there.
 */
export async function loadBoardVersion(
  characterId: number,
  communityId: string
): Promise<{ stamp: number; reset: number } | null> {
  if (communityBackendOverride()?.loadItemRequests) return null;
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDoc(
      doc(getSyncFirestore(characterId), 'communities', communityId, 'boardVersion', 'current')
    );
  });
  const data = snap.exists() ? snap.data() : {};
  const millis = (value: unknown) =>
    (value as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  return { stamp: millis(data.stamp), reset: millis(data.reset) };
}

/**
 * Sets the board's version stamp after a Pledge write (the callables set it for Requests), and
 * `reset` too when the write deleted a Pledge. Best effort: the Pledge is already saved, and a
 * missed stamp only leaves other devices on their cached board until it ages out.
 */
export async function bumpBoardVersion(
  characterId: number,
  communityId: string,
  deleted: boolean
): Promise<void> {
  try {
    await underFirebaseSession(async () => {
      await ensureSignedIn(characterId);
      await setDoc(
        doc(getSyncFirestore(characterId), 'communities', communityId, 'boardVersion', 'current'),
        deleted
          ? { stamp: serverTimestamp(), reset: serverTimestamp() }
          : { stamp: serverTimestamp() },
        { merge: true }
      );
    });
  } catch (err) {
    console.warn('Community board version could not be stamped', err);
  }
}

/** The Requests whose `lastActivityAt` is at or after `since` (epoch ms): the delta over a cached board. */
export async function loadRequestsActiveSince(
  characterId: number,
  communityId: string,
  since: number
): Promise<CommunityRequest[]> {
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      query(
        collection(getSyncFirestore(characterId), 'communities', communityId, 'itemRequests'),
        where('lastActivityAt', '>=', since)
      )
    );
  });
  return snap.docs
    .map((entry) => readRequest(entry.id, entry.data()))
    .filter((request): request is CommunityRequest => request !== null);
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
        collection(getSyncFirestore(characterId), 'communities', communityId, 'itemRequests'),
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
        getSyncFirestore(characterId),
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
      query(
        collectionGroup(getSyncFirestore(characterId), 'pledges'),
        where('communityId', '==', communityId)
      )
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
 * The Pledges in a Community written at or after `since` (epoch ms), by Request id: the delta over a
 * cached board. A collection-group query on `communityId` and `updatedAt` (a composite index in
 * firestore.indexes.json); callers fall back to the whole read when it is not deployed.
 */
export async function loadCommunityPledgesSince(
  characterId: number,
  communityId: string,
  since: number
): Promise<Map<string, RequestPledge[]>> {
  const found = new Map<string, RequestPledge[]>();
  const snap = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return getDocs(
      query(
        collectionGroup(getSyncFirestore(characterId), 'pledges'),
        where('communityId', '==', communityId),
        where('updatedAt', '>=', Timestamp.fromMillis(since))
      )
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
 * This Character's own Pledges in a Community, by Request id: the delivery sweep needs nothing
 * else. One collection-group query on `communityId` and `ownerHash` (every Pledge carries both,
 * the rules bind them), so it costs what the Character has pledged, not the whole Community.
 * Until its composite index is deployed it reads every Pledge in the Community, as before.
 */
export async function loadMyPledges(
  characterId: number,
  communityId: string
): Promise<Map<string, RequestPledge>> {
  const uid = uidForCharacter(characterId);
  const mineOf = (all: ReadonlyMap<string, readonly RequestPledge[]>) => {
    const mine = new Map<string, RequestPledge>();
    for (const [requestId, list] of all) {
      const pledge = list.find((p) => p.uid === uid);
      if (pledge) mine.set(requestId, pledge);
    }
    return mine;
  };
  const ownerHash = (await localDb.characters.get(characterId))?.ownerHash;
  if (communityBackendOverride()?.loadAllPledges || !ownerHash) {
    return mineOf(await loadCommunityPledges(characterId, communityId));
  }
  let snap;
  try {
    snap = await underFirebaseSession(async () => {
      await ensureSignedIn(characterId);
      return getDocs(
        query(
          collectionGroup(getSyncFirestore(characterId), 'pledges'),
          where('communityId', '==', communityId),
          where('ownerHash', '==', ownerHash)
        )
      );
    });
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
    return mineOf(await loadCommunityPledges(characterId, communityId));
  }
  const mine = new Map<string, RequestPledge>();
  for (const entry of snap.docs) {
    const requestId = entry.ref.parent.parent?.id;
    // The document id is the Pledger: an owner hash alone never makes a Pledge this Character's.
    if (!requestId || entry.id !== uid) continue;
    const pledge = readPledge(entry.id, entry.data());
    if (pledge) mine.set(requestId, pledge);
  }
  return mine;
}

/** Some Requests of a Community by id, one read each; one since removed is left out. */
export async function loadRequestsById(
  characterId: number,
  communityId: string,
  requestIds: readonly string[]
): Promise<CommunityRequest[]> {
  if (communityBackendOverride()?.loadItemRequests) {
    const wanted = new Set(requestIds);
    return (await loadRequests(characterId, communityId)).filter((r) => wanted.has(r.id));
  }
  const snaps = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    return Promise.all(
      requestIds.map((id) =>
        getDoc(doc(getSyncFirestore(characterId), 'communities', communityId, 'itemRequests', id))
      )
    );
  });
  return snaps
    .filter((snap) => snap.exists())
    .map((snap) => readRequest(snap.id, snap.data()))
    .filter((request): request is CommunityRequest => request !== null);
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
  const written = await underFirebaseSession(() =>
    writeMyPledge(characterId, communityId, requestId, uid, change)
  );
  await bumpBoardVersion(characterId, communityId, written === null);
  return written;
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
    getSyncFirestore(characterId),
    'communities',
    communityId,
    'itemRequests',
    requestId,
    'pledges',
    uid
  );
  const withdrawn = await runTransaction(getSyncFirestore(characterId), async (tx) => {
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
  const saved = await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    const ref = doc(
      getSyncFirestore(characterId),
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
  });
  await bumpBoardVersion(characterId, communityId, quote === null);
  return saved;
}

/**
 * Saves the contracts linked to this Character's held Quote, when the Quote is
 * still the one that was matched (`quotedAt`): a second paste in the meantime
 * replaced it, and its links start empty. Only ids and statuses are written.
 */
export async function saveQuoteLinks(
  characterId: number,
  communityId: string,
  requestId: string,
  quotedAt: number,
  links: readonly QuoteLinkRef[]
): Promise<void> {
  const uid = uidForCharacter(characterId);
  const withLinks = (quote: HeldQuote): HeldQuote => {
    const next: HeldQuote = { ...quote };
    if (links.length > 0) next.links = [...links];
    else delete next.links;
    return next;
  };
  const override = communityBackendOverride();
  if (override?.saveQuote && override.loadPledges) {
    const mine = override.loadPledges(communityId, requestId).find((p) => p.uid === uid);
    if (mine?.quote?.quotedAt === quotedAt) {
      override.saveQuote(communityId, requestId, withLinks(mine.quote));
    }
    return;
  }
  await underFirebaseSession(async () => {
    await ensureSignedIn(characterId);
    const ownerHash = (await localDb.characters.get(characterId))?.ownerHash;
    if (!ownerHash) throw new Error('This Character has no owner hash yet');
    const ref = doc(
      getSyncFirestore(characterId),
      'communities',
      communityId,
      'itemRequests',
      requestId,
      'pledges',
      uid
    );
    await runTransaction(getSyncFirestore(characterId), async (tx) => {
      const stored = await tx.get(ref);
      const quote = stored.exists() ? readQuote(stored.data().quote) : undefined;
      if (!quote || quote.quotedAt !== quotedAt) return;
      tx.set(ref, {
        ownerHash,
        communityId,
        lines: {},
        quote: withLinks(quote),
        updatedAt: serverTimestamp(),
      });
    });
  });
  await bumpBoardVersion(characterId, communityId, false);
}
