import { DAY_MS } from './timeConstants.js';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import {
  BOOKS_COLLECTION,
  FEEDERS,
  FEEDER_OF_COLLECTION,
  REMOVAL_LINKS_COLLECTION,
  parseFeederTarget,
  type FeederTargetCall,
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
import { isMissingIndex, isTopLevelChild } from './indexedSweep.js';
import {
  appendAudit,
  authorizeOfficer,
  feederRef,
  liveOfficerIds,
  type BookDeps,
} from './corpTaxBookStore.js';
import { signedInCharacter, fail, type Caller } from './actorAuth.js';

const LINK_SLACK_MS = DAY_MS;

const LINK_TTL_MS = REMOVAL_WAIT_MS + LINK_SLACK_MS;

const payeeOf = (rec: FeederRecord): NonNullable<FeederRecord['payee']> =>
  rec.payee ?? { kind: 'corporation', id: rec.corporationId };

const linkRef = (db: BookDeps['db'], id: string) => db.collection(REMOVAL_LINKS_COLLECTION).doc(id);

export interface RemovalLinkDoc {
  collectorCorporationId: number;
  feederCorporationId: number;
  startedAt: number;
  expiresAt: number;
  effectiveAt?: number;
}

export type RemovalCall = FeederTargetCall;

export const parseRemovalCall = parseFeederTarget;

export interface RemovalNoticeCall extends RemovalCall {
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

interface Recipients {
  all: number[];
  owner: number[];
}

async function recipientsFor(
  deps: BookDeps,
  collector: number,
  rec: FeederRecord,
  excludeCharacterId: number
): Promise<Recipients> {
  const officerIds = await liveOfficerIds(deps, collector);
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

export interface StartRemovalResult {
  startedAt: number;
  code: string;
  recipients: number[];
  ownerRecipients: number[];
}

export async function startFeederRemoval(
  deps: BookDeps,
  caller: Caller,
  input: RemovalCall
): Promise<StartRemovalResult> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = feederRef(deps.db, input.corporationId, input.feederCorporationId);
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

export async function recordRemovalSent(
  deps: BookDeps,
  caller: Caller,
  input: RemovalNoticeCall
): Promise<{ effectiveAt: number | null }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = feederRef(deps.db, input.corporationId, input.feederCorporationId);
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

export async function cancelFeederRemoval(
  deps: BookDeps,
  caller: Caller,
  input: RemovalCall
): Promise<{ recipients: number[] }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = feederRef(deps.db, input.corporationId, input.feederCorporationId);
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

export const STALE_MAIL_CLAIM_MS = 4 * 60 * 60 * 1000;

export function staleMailClaimable(
  held: Pick<
    FeederRecord,
    'staleSince' | 'staleMailedFor' | 'staleMailClaimedAt' | 'staleMailSentFor'
  >,
  now: number
): boolean {
  if (held.staleSince === undefined) return false;
  if (held.staleMailedFor !== held.staleSince) return true;
  if (held.staleMailSentFor === held.staleSince) return false;
  return (
    held.staleMailClaimedAt !== undefined && now - held.staleMailClaimedAt >= STALE_MAIL_CLAIM_MS
  );
}

export interface StaleMailClaimCall extends RemovalCall {
  marksSent?: boolean;
}

export function parseStaleMailClaimCall(data: unknown): StaleMailClaimCall {
  const call = parseRemovalCall(data);
  return record(data).marksSent === true ? { ...call, marksSent: true } : call;
}

export async function claimFeederStaleMail(
  deps: BookDeps,
  caller: Caller,
  input: StaleMailClaimCall
): Promise<{ recipients: number[]; ownerRecipients: number[] }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = feederRef(deps.db, input.corporationId, input.feederCorporationId);
  const now = deps.now();
  const claimed = await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (
      !held ||
      !staleMailClaimable(held, now) ||
      held.sameOwner === true ||
      held.status === 'left' ||
      held.status === 'removed'
    ) {
      return undefined;
    }
    tx.update(ref, {
      staleMailedFor: held.staleSince,
      staleMailClaimedAt: input.marksSent ? now : FieldValue.delete(),
    });
    return held;
  });
  if (!claimed) return { recipients: [], ownerRecipients: [] };
  const { all, owner } = await recipientsFor(
    deps,
    input.corporationId,
    claimed,
    access.characterId
  );
  return { recipients: all, ownerRecipients: owner };
}

export interface StaleMailSentCall extends RemovalCall {
  staleSince: number;
}

export function parseStaleMailSentCall(data: unknown): StaleMailSentCall {
  const call = parseRemovalCall(data);
  const staleSince = record(data).staleSince;
  if (typeof staleSince !== 'number' || !Number.isSafeInteger(staleSince) || staleSince <= 0)
    throw new HttpsError('invalid-argument', 'staleSince must be a time');
  return { ...call, staleSince };
}

export async function markFeederStaleMailSent(
  deps: BookDeps,
  caller: Caller,
  input: StaleMailSentCall
): Promise<Record<string, never>> {
  await authorizeOfficer(deps, caller, input, 'edit', { live: false });
  const ref = feederRef(deps.db, input.corporationId, input.feederCorporationId);
  await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!held || held.staleSince !== input.staleSince || held.staleMailSentFor === input.staleSince)
      return;
    tx.update(ref, { staleMailSentFor: input.staleSince });
  });
  return {};
}

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
  linkId?: string;
}

const UNAVAILABLE: Resolved = { state: { available: false } };

async function resolveLink(deps: BookDeps, caller: Caller, code: string): Promise<Resolved> {
  const characterId = signedInCharacter(caller);
  const linkId = hashInviteCode(code);
  const link = (await linkRef(deps.db, linkId).get()).data() as RemovalLinkDoc | undefined;
  if (!link) return UNAVAILABLE;
  const copy = link.effectiveAt ?? null;
  if (deps.now() >= link.expiresAt) return UNAVAILABLE;
  const rec = (
    await feederRef(deps.db, link.collectorCorporationId, link.feederCorporationId).get()
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

function isLinkedRemoval(rec: FeederRecord, link: RemovalLinkDoc, linkId: string): boolean {
  return (
    rec.status === 'pending-removal' &&
    rec.removal?.startedAt === link.startedAt &&
    (rec.removalLinkId === undefined || rec.removalLinkId === linkId) &&
    payeeMayForce({
      payeeChangedAt: rec.payeeChangedAt,
      removalStartedAt: link.startedAt,
      payeeSetBy: rec.payeeSetBy?.side,
    })
  );
}

export async function getRemovalLink(
  deps: BookDeps,
  caller: Caller,
  input: RemovalLinkCall
): Promise<RemovalLinkState> {
  return (await resolveLink(deps, caller, input.code)).state;
}

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
  const characterId = signedInCharacter(caller);
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
    return { ended: false };
  }
  return { ended: true, effectiveAt: state.effectiveAt };
}

async function pendingRemovals(
  { db, log }: Pick<CorpSyncDeps, 'db' | 'log'>,
  pointerCollection: string
): Promise<{ feederCorporationId: number; collectorCorporationId: number; rec: FeederRecord }[]> {
  try {
    const snap = await db.collectionGroup(FEEDERS).where('status', '==', 'pending-removal').get();
    return snap.docs.flatMap((d) => {
      if (!isTopLevelChild(d, BOOKS_COLLECTION)) return [];
      const collector = Number(d.ref.parent.parent!.id);
      const feeder = Number(d.id);
      return Number.isSafeInteger(collector) && Number.isSafeInteger(feeder)
        ? [
            {
              feederCorporationId: feeder,
              collectorCorporationId: collector,
              rec: d.data() as FeederRecord,
            },
          ]
        : [];
    });
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
    log('Collection-group index not deployed yet; using the per-parent scan', {
      sweep: 'finalizeDueRemovals',
    });
  }
  const found = [];
  for (const pointer of await feedersToRead(db, pointerCollection)) {
    try {
      const rec = (
        await feederRef(db, pointer.collectorCorporationId, pointer.feederCorporationId).get()
      ).data() as FeederRecord | undefined;
      if (rec) found.push({ ...pointer, rec });
    } catch (err) {
      log('Removal could not take effect', {
        ...pointer,
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return found;
}

export async function finalizeDueRemovals(
  deps: CorpSyncDeps,
  pointerCollection: string = FEEDER_OF_COLLECTION
): Promise<{ ended: number }> {
  let ended = 0;
  for (const { feederCorporationId, collectorCorporationId, rec } of await pendingRemovals(
    deps,
    pointerCollection
  )) {
    try {
      if (!isRemovalDue({ status: rec.status, removal: rec.removal }, deps.now())) {
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
