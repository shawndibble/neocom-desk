// Collector books (issue #4520, spec #4504): the accounting corporation removes a moon owner.
// A 24-hour pending removal that starts counting when the mail goes out; officers cancel it,
// the moon owner ends it at once (Leave, or the payee's link). Failures carry stable `reason`
// codes; no player-facing text lives here.
//
// The payee's link answers "unavailable" with one shape for every reason it cannot be used:
// expired, already over, wrong person, or the payee guard (engine `payeeMayForce`). The reason
// is never in the response, the logs or the audit trail.

import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import {
  FEEDERS,
  FEEDER_OF_COLLECTION,
  OFFICERS,
  REMOVAL_LINKS_COLLECTION,
  parseBookCall,
  type BookCall,
} from './corpTaxBook.js';
import {
  REMOVAL_WAIT_MS,
  canStartRemoval,
  isPayeeActor,
  isRemovalDue,
  moonOwnerMailRecipients,
  payeeMayForce,
  recordRemovalNotice,
  removalRecipients,
  startRemoval,
} from './corpTaxBookEngine.js';
import type { CorpSyncDeps } from './corpSyncGrant.js';
import { endFeeder } from './corpTaxBookFeederGrant.js';
import { feedersToRead } from './corpTaxBookFeederSync.js';
import { tryRebuildFeederView } from './corpTaxBookFeederView.js';
import { hashInviteCode, type FeederRecord } from './corpTaxBookFeeders.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';
import { characterIdForUid } from './verifyEveToken.js';

/** Slack on the link past the wait, for a mail read late. */
const LINK_SLACK_MS = 24 * 3_600_000;

/**
 * How long the mail's link stays valid, from the start: the wait plus slack. Once the notice is
 * out it runs to `effectiveAt` plus the slack instead (#4617), since the queue may send late.
 */
const LINK_TTL_MS = REMOVAL_WAIT_MS + LINK_SLACK_MS;

function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

/** No payee on record means the moon owner corporation itself is paid: its CEO acts for it. */
const payeeOf = (rec: FeederRecord): NonNullable<FeederRecord['payee']> =>
  rec.payee ?? { kind: 'corporation', id: rec.corporationId };

const linkRef = (db: BookDeps['db'], id: string) => db.collection(REMOVAL_LINKS_COLLECTION).doc(id);

/** `corpTaxBookRemovalLinks/{hash}`. */
export interface RemovalLinkDoc {
  collectorCorporationId: number;
  feederCorporationId: number;
  /** The removal this link belongs to (`removal.startedAt`). */
  startedAt: number;
  expiresAt: number;
  /** A copy of the removal's effective time, shown only while the link can be used. */
  effectiveAt?: number;
}

// --- Input -----------------------------------------------------------------

export interface RemovalCall extends BookCall {
  feederCorporationId: number;
}

export function parseRemovalCall(data: unknown): RemovalCall {
  const id = record(data).feederCorporationId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'feederCorporationId must be a corporation id');
  }
  return { ...parseBookCall(data), feederCorporationId: id };
}

export interface RemovalNoticeCall extends RemovalCall {
  /** When the mail went out (ms); clamped to the removal's start and now. */
  sentAt?: number;
}

export function parseRemovalNoticeCall(data: unknown): RemovalNoticeCall {
  const call = parseRemovalCall(data);
  const sentAt = record(data).sentAt;
  if (sentAt === undefined) return call;
  if (typeof sentAt !== 'number' || !Number.isFinite(sentAt)) {
    throw new HttpsError('invalid-argument', 'sentAt must be a time');
  }
  return { ...call, sentAt };
}

export interface RemovalLinkCall {
  code: string;
}

export function parseRemovalLinkCall(data: unknown): RemovalLinkCall {
  return { code: boundedString(record(data).code, 'code', 64) };
}

// --- Recipients ------------------------------------------------------------

interface Recipients {
  /** Everyone the one mail goes to: the moon owner side first, then the other officers. */
  all: number[];
  /** The moon owner's CEO and payee: a copy to one of them starts the clock (#4617). */
  owner: number[];
}

async function recipientsFor(
  deps: BookDeps,
  collector: number,
  rec: FeederRecord,
  excludeCharacterId: number
): Promise<Recipients> {
  const now = deps.now();
  const officers = await bookRef(deps.db, collector).collection(OFFICERS).get();
  const officerIds = officers.docs.flatMap((d) => {
    const id = d.get('characterId');
    const expires = d.get('expiresAt');
    return typeof id === 'number' && typeof expires === 'number' && expires > now ? [id] : [];
  });
  const ceoOf = deps.corporationCeo ?? (async () => undefined);
  const ceoId = await ceoOf(rec.corporationId).catch(() => undefined);
  const payee = payeeOf(rec);
  const payeeCeoId =
    payee.kind === 'corporation' ? await ceoOf(payee.id).catch(() => undefined) : undefined;
  const input = {
    officerIds,
    startedBy: excludeCharacterId,
    ceoId: ceoId ?? null,
    payee,
    payeeCeoId: payeeCeoId ?? null,
  };
  return { all: removalRecipients(input), owner: moonOwnerMailRecipients(input) };
}

// --- Start, notice, cancel --------------------------------------------------

export interface StartRemovalResult {
  startedAt: number;
  /** The code for the link in the mail; shown nowhere else and never stored. */
  code: string;
  /** Character ids the one mail goes to, the moon owner side first. */
  recipients: number[];
  /**
   * The moon owner's CEO and payee among them (#4617): only a copy to one of these starts the
   * 24 hours. Empty when neither could be found; the removal then waits on "I sent the notice".
   */
  ownerRecipients: number[];
}

/** Start a removal. The status flips at once; the 24 hours wait for the notice (`recordRemovalSent`). */
export async function startFeederRemoval(
  deps: BookDeps,
  caller: Caller,
  input: RemovalCall
): Promise<StartRemovalResult> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = bookRef(deps.db, input.corporationId)
    .collection(FEEDERS)
    .doc(String(input.feederCorporationId));
  const code = randomBytes(24).toString('base64url');
  const linkId = hashInviteCode(code);
  const now = deps.now();
  const rec = await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!held) fail('not-found', 'No such moon owner', 'no-feeder');
    if (!canStartRemoval(held)) {
      fail('failed-precondition', 'This moon owner cannot be removed now', 'not-removable');
    }
    const next = startRemoval(
      { status: held.status },
      { characterId: access.characterId, name: access.characterName },
      now
    );
    const link: RemovalLinkDoc = {
      collectorCorporationId: input.corporationId,
      feederCorporationId: input.feederCorporationId,
      startedAt: now,
      expiresAt: now + LINK_TTL_MS,
    };
    tx.update(ref, { status: next.status, removal: next.removal, removalLinkId: linkId });
    tx.create(linkRef(deps.db, linkId), link);
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederRemovalStarted',
      { feederCorporationId: input.feederCorporationId }
    );
    return held;
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  const { all, owner } = await recipientsFor(deps, input.corporationId, rec, access.characterId);
  return { startedAt: now, code, recipients: all, ownerRecipients: owner };
}

/**
 * The notice went out (the queue sent the mail, or the officer sent it from EVE): the 24
 * hours run from here. The first notice wins; later ones change nothing.
 */
export async function recordRemovalSent(
  deps: BookDeps,
  caller: Caller,
  input: RemovalNoticeCall
): Promise<{ effectiveAt: number | null }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = bookRef(deps.db, input.corporationId)
    .collection(FEEDERS)
    .doc(String(input.feederCorporationId));
  const now = deps.now();
  const effectiveAt = await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec || rec.status !== 'pending-removal' || !rec.removal) return null;
    const startedAt = rec.removal.startedAt;
    const sentAt = Math.min(Math.max(input.sentAt ?? now, startedAt), now);
    const next = recordRemovalNotice({ status: rec.status, removal: rec.removal }, sentAt);
    if (next.removal?.effectiveAt === undefined) return rec.removal.effectiveAt ?? null;
    if (next.removal === rec.removal) return rec.removal.effectiveAt ?? null;
    tx.update(ref, { removal: next.removal });
    if (rec.removalLinkId) {
      // The link lives until the removal takes effect, however late the notice went out.
      tx.update(linkRef(deps.db, rec.removalLinkId), {
        effectiveAt: next.removal.effectiveAt,
        expiresAt: next.removal.effectiveAt + LINK_SLACK_MS,
      });
    }
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederRemovalNoticeSent',
      { feederCorporationId: input.feederCorporationId, effectiveAt: next.removal.effectiveAt }
    );
    return next.removal.effectiveAt;
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  return { effectiveAt };
}

/** Any Accountant or higher cancels, the starter included. Returns whom the short second mail goes to. */
export async function cancelFeederRemoval(
  deps: BookDeps,
  caller: Caller,
  input: RemovalCall
): Promise<{ recipients: number[] }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = bookRef(deps.db, input.corporationId)
    .collection(FEEDERS)
    .doc(String(input.feederCorporationId));
  const rec = await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!held) fail('not-found', 'No such moon owner', 'no-feeder');
    if (held.status !== 'pending-removal') {
      fail('failed-precondition', 'No removal is pending', 'not-pending');
    }
    tx.update(ref, {
      status: 'active',
      removal: FieldValue.delete(),
      removalLinkId: FieldValue.delete(),
    });
    if (held.removalLinkId) tx.delete(linkRef(deps.db, held.removalLinkId));
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederRemovalCancelled',
      { feederCorporationId: input.feederCorporationId }
    );
    return held;
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  const { all } = await recipientsFor(deps, input.corporationId, rec, access.characterId);
  return { recipients: all };
}

// --- The payee's link ---------------------------------------------------------

/**
 * What the link says when it cannot be used, for any reason. One shape with no time in it, so
 * the page cannot tell an expired link (its time behind) from a guarded one (its time ahead).
 */
export interface RemovalLinkUnavailable {
  available: false;
}

export type RemovalLinkState =
  | RemovalLinkUnavailable
  | {
      available: true;
      collectorCorporationId: number;
      feederCorporationId: number;
      effectiveAt: number | null;
    };

interface Resolved {
  state: RemovalLinkState;
  link?: RemovalLinkDoc;
  /** The link's id, for checking it is still the removal's own when the removal is ended. */
  linkId?: string;
}

const UNAVAILABLE: Resolved = { state: { available: false } };

async function resolveLink(deps: BookDeps, caller: Caller, code: string): Promise<Resolved> {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined) {
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  }
  const linkId = hashInviteCode(code);
  const link = (await linkRef(deps.db, linkId).get()).data() as RemovalLinkDoc | undefined;
  if (!link) return UNAVAILABLE;
  const copy = link.effectiveAt ?? null;
  if (deps.now() >= link.expiresAt) return UNAVAILABLE;
  const rec = (
    await bookRef(deps.db, link.collectorCorporationId)
      .collection(FEEDERS)
      .doc(String(link.feederCorporationId))
      .get()
  ).data() as FeederRecord | undefined;
  if (!rec || !isLinkedRemoval(rec, link, linkId)) return UNAVAILABLE;
  const ceoOf = deps.corporationCeo ?? (async () => undefined);
  const payee = payeeOf(rec);
  const payeeCorporationCeoId =
    payee.kind === 'corporation' ? await ceoOf(payee.id).catch(() => undefined) : undefined;
  if (!isPayeeActor({ payee, characterId, payeeCorporationCeoId })) return UNAVAILABLE;
  return {
    state: {
      available: true,
      collectorCorporationId: link.collectorCorporationId,
      feederCorporationId: link.feederCorporationId,
      effectiveAt: copy,
    },
    link,
    linkId,
  };
}

/**
 * The record still holds the removal this link was made for, and its payee may end it. Read
 * again inside the transaction that ends it, so a cancel and restart, or a payee change, that
 * landed since the link was read refuses it.
 */
function isLinkedRemoval(rec: FeederRecord, link: RemovalLinkDoc, linkId: string): boolean {
  return (
    rec.status === 'pending-removal' &&
    rec.removal?.startedAt === link.startedAt &&
    // A link written before the record kept its id has none to compare.
    (rec.removalLinkId === undefined || rec.removalLinkId === linkId) &&
    payeeMayForce({ payeeChangedAt: rec.payeeChangedAt, removalStartedAt: link.startedAt })
  );
}

/** What the "Remove now" page shows for this signed-in Character and link. */
export async function getRemovalLink(
  deps: BookDeps,
  caller: Caller,
  input: RemovalLinkCall
): Promise<RemovalLinkState> {
  return (await resolveLink(deps, caller, input.code)).state;
}

/** The payee ends the removal now. Unavailable looks the same whatever stopped it. */
export async function forceRemovalNow(
  deps: CorpSyncDeps,
  caller: Caller,
  input: RemovalLinkCall,
  corporationCeo?: BookDeps['corporationCeo']
): Promise<{ ended: false } | { ended: true; effectiveAt: number | null }> {
  const bookDeps: BookDeps = {
    db: deps.db,
    now: deps.now,
    verifyToken: deps.verify,
    readIdentity: deps.readIdentity,
    ...(corporationCeo ? { corporationCeo } : {}),
  };
  const { state, link, linkId } = await resolveLink(bookDeps, caller, input.code);
  if (!state.available || !link || !linkId) return { ended: false };
  const characterId = characterIdForUid(caller.uid)!;
  try {
    await endFeeder(deps, {
      collectorCorporationId: link.collectorCorporationId,
      feederCorporationId: link.feederCorporationId,
      effectiveAt: deps.now(),
      finalStatus: 'removed',
      actor: { characterId, name: 'Payee' },
      action: 'feederRemovalForced',
      allowed: ['pending-removal'],
      guard: (rec) => isLinkedRemoval(rec, link, linkId),
    });
  } catch {
    // Raced with a cancel, a restart or the clock: the same answer as an expired link.
    return { ended: false };
  }
  return { ended: true, effectiveAt: state.effectiveAt };
}

// --- Taking effect -----------------------------------------------------------

/** End every removal whose wait is over. Scheduled hourly; one failure never stops the rest. */
export async function finalizeDueRemovals(
  deps: CorpSyncDeps,
  pointerCollection: string = FEEDER_OF_COLLECTION
): Promise<{ ended: number }> {
  let ended = 0;
  for (const { feederCorporationId, collectorCorporationId } of await feedersToRead(
    deps.db,
    pointerCollection
  )) {
    try {
      const rec = (
        await bookRef(deps.db, collectorCorporationId)
          .collection(FEEDERS)
          .doc(String(feederCorporationId))
          .get()
      ).data() as FeederRecord | undefined;
      if (!rec || !isRemovalDue({ status: rec.status, removal: rec.removal }, deps.now())) {
        continue;
      }
      const startedAt = rec.removal!.startedAt;
      await endFeeder(deps, {
        collectorCorporationId,
        feederCorporationId,
        effectiveAt: rec.removal!.effectiveAt!,
        finalStatus: 'removed',
        actor: { characterId: null, name: 'Removal taking effect', via: 'scheduled' },
        action: 'feederRemoved',
        allowed: ['pending-removal'],
        // The same removal, still due: a cancel and restart meanwhile is a new one with its own wait.
        guard: (held) =>
          held.removal?.startedAt === startedAt &&
          isRemovalDue({ status: held.status, removal: held.removal }, deps.now()),
      });
      ended += 1;
    } catch (err) {
      deps.log('Removal could not take effect', {
        feederCorporationId,
        collectorCorporationId,
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return { ended };
}
