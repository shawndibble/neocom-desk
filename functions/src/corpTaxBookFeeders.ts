import { utcDay } from './timeConstants.js';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, newInviteCode, record } from './communities.js';
import {
  FEEDER_INVITES_COLLECTION,
  FEEDER_OF_COLLECTION,
  parseBookCall,
  pctField,
  type BookCall,
} from './corpTaxBook.js';
import {
  clampCoverageFrom,
  reconnectCoverageFrom,
  deriveModeChanges,
  reopenPeriod,
  type CoveragePeriod,
  type FeederModeChange,
  type OwnerRateEntry,
  type Removal,
} from './corpTaxBookEngine.js';
import { appendAgreedRate } from './corpTaxBookFeederOwnerCalls.js';
import { refreshMemberCoverage } from './corpTaxBookFeederView.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  feederRef,
  type BookDeps,
} from './corpTaxBookStore.js';
import {
  requireLiveRoles,
  signedInCharacter,
  verifyCallerToken,
  fail,
  type Caller,
} from './actorAuth.js';

export type FeederStatus = 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';

export interface FeederRecord {
  corporationId: number;
  status: FeederStatus;
  invitedBy: number;
  joinedAt: number;
  leftAt?: number;
  grantHolder?: number;
  lastSyncResult?: { at: number; outcome: 'synced' | 'skipped' | 'stale'; reason?: string };
  lastReadWellAt?: number;
  staleSince?: number;
  staleReason?: string;
  disconnectedAt?: number;
  staleMailedFor?: number;
  staleMailClaimedAt?: number;
  staleMailSentFor?: number;
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeChangedAt?: number;
  payeeSetBy?: PayeeSetBy;
  popSharingOptOut?: { by: number; at: number };
  removal?: Removal;
  removalLinkId?: string;
  mode: 'normal' | 'settled-otherwise';
  sameOwner?: boolean;
  payoutTotals?: { count: number; amount: number };
  note?: string;
  grantedBy?: number;
  requestedRatePct?: number;
  agreedRatePct?: number;
  offeredOwnerRatePct?: number;
  coveragePeriods: CoveragePeriod[];
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
  viewDismissedAt?: number;
  refineryLabels?: Record<string, RefineryLabelDoc>;
  refineryArchive?: Record<string, RefineryArchiveDoc>;
  refinerySystems?: Record<string, number>;
  refineryStructures?: Record<string, RefineryStructureDoc>;
  readsStructureNames?: boolean;
  readsNotifications?: boolean;
  extractionsRefusedAt?: number;
}

export interface RefineryStructureDoc {
  name?: string;
  solarSystemId?: number;
  checkedAt: number;
  denied?: boolean;
}

export interface RefineryArchiveDoc {
  at: number;
  by: number;
  reason: 'gone' | 'idle' | 'manual';
}

export interface PayeeSetBy {
  side: 'accounting' | 'moon-owner';
  characterId: number;
  at: number;
}

export interface RefineryLabelDoc {
  label: string;
  setAt: string;
  setBy: number;
  side: 'accounting' | 'moon-owner';
}

export interface FeederInviteDoc {
  collectorCorporationId: number;
  createdBy: number;
  createdAt: number;
  offeredOwnerRatePct?: number;
  coverageFrom?: string;
  sameOwner?: boolean;
  selfInvite?: boolean;
  revokedAt?: number;
  acceptedBy?: number;
  acceptedAt?: number;
  acceptedByCorporationId?: number;
}

export const MAX_OPEN_FEEDER_INVITES = 20;

export const hashInviteCode = (code: string) => createHash('sha256').update(code).digest('hex');

export const inviteRef = (db: BookDeps['db'], id: string) =>
  db.collection(FEEDER_INVITES_COLLECTION).doc(id);

export interface CreateFeederInviteInput extends BookCall {
  offeredOwnerRatePct?: number;
}

export function parseCreateFeederInviteInput(data: unknown): CreateFeederInviteInput {
  const d = record(data);
  const call = parseBookCall(data);
  const rate = d.offeredOwnerRatePct;
  if (rate === undefined) return call;
  return { ...call, offeredOwnerRatePct: pctField(rate, 'offeredOwnerRatePct') };
}

export interface RevokeFeederInviteInput extends BookCall {
  inviteId: string;
}

export function parseRevokeFeederInviteInput(data: unknown): RevokeFeederInviteInput {
  const d = record(data);
  const inviteId = boundedString(d.inviteId, 'inviteId', 64);
  if (!/^[0-9a-f]{64}$/.test(inviteId)) {
    throw new HttpsError('invalid-argument', 'inviteId is not an invite id');
  }
  return { ...parseBookCall(data), inviteId };
}

export interface AcceptFeederInviteInput {
  code: string;
  accessToken: string;
}

export async function requireActiveBook(deps: BookDeps, corporationId: number): Promise<void> {
  const book = await bookRef(deps.db, corporationId).get();
  if (!book.exists || book.get('active') !== true) {
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  }
}

export async function createFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: CreateFeederInviteInput
): Promise<{ code: string; inviteId: string }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  await requireActiveBook(deps, input.corporationId);
  const code = newInviteCode();
  const inviteId = hashInviteCode(code);
  const now = deps.now();
  await deps.db.runTransaction(async (tx) => {
    const open = await tx.get(
      deps.db
        .collection(FEEDER_INVITES_COLLECTION)
        .where('collectorCorporationId', '==', input.corporationId)
    );
    const openCount = open.docs.filter(
      (d) => !d.get('revokedAt') && !d.get('acceptedAt') && !d.get('selfInvite')
    ).length;
    if (openCount >= MAX_OPEN_FEEDER_INVITES) {
      fail('resource-exhausted', 'Too many open invite links', 'too-many-invites');
    }
    const doc: FeederInviteDoc = {
      collectorCorporationId: input.corporationId,
      createdBy: access.characterId,
      createdAt: now,
      ...(input.offeredOwnerRatePct !== undefined
        ? { offeredOwnerRatePct: input.offeredOwnerRatePct }
        : {}),
    };
    tx.create(inviteRef(deps.db, inviteId), doc);
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederInviteCreated',
      {
        inviteId,
        ...(input.offeredOwnerRatePct !== undefined
          ? { offeredOwnerRatePct: input.offeredOwnerRatePct }
          : {}),
      }
    );
  });
  return { code, inviteId };
}

export async function revokeFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: RevokeFeederInviteInput
): Promise<{ revoked: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = inviteRef(deps.db, input.inviteId);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const invite = snap.data() as FeederInviteDoc | undefined;
    if (!invite || invite.collectorCorporationId !== input.corporationId) {
      fail('not-found', 'No such invite link', 'invite-invalid');
    }
    if (invite.acceptedAt) fail('failed-precondition', 'This link was already used', 'invite-used');
    if (invite.revokedAt) return;
    tx.update(ref, { revokedAt: deps.now() });
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederInviteRevoked',
      { inviteId: input.inviteId }
    );
  });
  return { revoked: true };
}

export interface FeederInvitePreview {
  collectorCorporationId: number;
  collectorName: string | null;
  offeredOwnerRatePct: number | null;
}

export function parsePreviewFeederInviteInput(data: unknown): { code: string } {
  return { code: boundedString(record(data).code, 'code', 64) };
}

export async function previewFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: { code: string }
): Promise<FeederInvitePreview> {
  signedInCharacter(caller);
  const invite = (await inviteRef(deps.db, hashInviteCode(input.code)).get()).data() as
    FeederInviteDoc | undefined;
  const book =
    invite && !invite.revokedAt && !invite.acceptedAt
      ? await bookRef(deps.db, invite.collectorCorporationId).get()
      : undefined;
  if (!invite || !book?.exists || book.get('active') !== true) {
    fail('not-found', 'No such invite link', 'invite-invalid');
  }
  const name = book.get('corporationName');
  return {
    collectorCorporationId: invite.collectorCorporationId,
    collectorName: typeof name === 'string' && name !== '' ? name : null,
    offeredOwnerRatePct: invite.offeredOwnerRatePct ?? null,
  };
}

export interface AcceptFeederInviteResult {
  collectorCorporationId: number;
  feederCorporationId: number;
  rejoined: boolean;
}

export async function acceptFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: AcceptFeederInviteInput
): Promise<AcceptFeederInviteResult> {
  const actor = await verifyCallerToken(deps, caller, input.accessToken);
  const { characterId, claims } = actor;
  const { identity } = await requireLiveRoles(deps, actor, {
    need: 'canEdit',
    denied: { message: 'Only a CEO, Director or Accountant can accept', reason: 'not-an-editor' },
  });
  const accepted = await acceptInviteCore(deps, {
    code: input.code,
    characterId,
    name: claims.name,
    feederCorp: identity.corporationId,
  });
  await refreshMemberCoverage(
    deps.db,
    accepted.collectorCorporationId,
    accepted.feederCorporationId
  );
  return {
    collectorCorporationId: accepted.collectorCorporationId,
    feederCorporationId: accepted.feederCorporationId,
    rejoined: accepted.rejoined,
  };
}

export interface AcceptUndo {
  priorRecord?: FeederRecord;
  priorPointer?: { collectorCorporationId: number; since: number };
  inviteId: string;
}

const FEED_STATE: readonly (keyof FeederRecord)[] = [
  'leftAt',
  'staleSince',
  'staleReason',
  'staleMailedFor',
  'staleMailClaimedAt',
  'staleMailSentFor',
  'disconnectedAt',
  'lastSyncResult',
  'extractionsRefusedAt',
  'viewDismissedAt',
  'offeredOwnerRatePct',
  'grantHolder',
  'grantedBy',
];

function offeredRate(base: FeederRecord, invite: FeederInviteDoc, now: number) {
  const pct = invite.offeredOwnerRatePct;
  if (pct === undefined) return {};
  return {
    offeredOwnerRatePct: pct,
    agreedRatePct: pct,
    ownerRateHistory: appendAgreedRate(base, pct, now),
  };
}

export interface AcceptCoreInput {
  code: string;
  characterId: number;
  name: string;
  feederCorp: number;
  recordExtra?: Partial<FeederRecord>;
  allowTakeBack?: boolean;
}

export async function acceptInviteCore(
  deps: BookDeps,
  input: AcceptCoreInput
): Promise<AcceptFeederInviteResult & { undo: AcceptUndo }> {
  const { characterId, feederCorp } = input;
  const claims = { name: input.name };
  const extra = input.recordExtra ?? {};
  const inviteId = hashInviteCode(input.code);
  const now = deps.now();
  const today = utcDay(now);

  return deps.db.runTransaction(async (tx) => {
    const invite = (await tx.get(inviteRef(deps.db, inviteId))).data() as
      FeederInviteDoc | undefined;
    if (!invite) fail('not-found', 'No such invite link', 'invite-invalid');
    if (invite.revokedAt) fail('failed-precondition', 'This link was revoked', 'invite-revoked');
    if (invite.acceptedAt) fail('failed-precondition', 'This link was already used', 'invite-used');
    const collector = invite.collectorCorporationId;
    if (collector === feederCorp) {
      fail('failed-precondition', 'A corporation cannot feed its own book', 'own-book-exists');
    }
    const collectorBook = await tx.get(bookRef(deps.db, collector));
    if (!collectorBook.exists || collectorBook.get('active') !== true) {
      fail('failed-precondition', 'That book is no longer open', 'collector-gone');
    }
    if ((await tx.get(bookRef(deps.db, feederCorp))).exists) {
      fail('failed-precondition', 'This corporation runs its own book', 'own-book-exists');
    }
    const pointerRef = deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp));
    const pointer = (await tx.get(pointerRef)).data() as AcceptUndo['priorPointer'];
    const recordRef = feederRef(deps.db, collector, feederCorp);
    const held = (await tx.get(recordRef)).data() as FeederRecord | undefined;
    const takenBack =
      input.allowTakeBack === true &&
      pointer?.collectorCorporationId === collector &&
      held?.status === 'disconnected';
    if (pointer && !takenBack)
      fail('failed-precondition', 'This corporation already feeds a book', 'already-feeder');

    const startDate: unknown = collectorBook.get('startDate');
    let from =
      takenBack && invite.coverageFrom === undefined
        ? reconnectCoverageFrom(
            held?.coveragePeriods ?? [],
            today,
            held ? utcDay(held.joinedAt) : undefined
          )
        : clampCoverageFrom(held?.coveragePeriods ?? [], invite.coverageFrom, today);
    if (typeof startDate === 'string' && startDate > from && startDate <= today) from = startDate;
    const sameOwner = invite.sameOwner === true;
    const settled: FeederModeChange = { from, mode: 'settled-otherwise' };

    let rejoined = false;
    let priorRecord: FeederRecord | undefined;
    if (!held) {
      const created: FeederRecord = {
        corporationId: feederCorp,
        status: 'active',
        invitedBy: invite.createdBy,
        joinedAt: now,
        mode: sameOwner ? 'settled-otherwise' : 'normal',
        coveragePeriods: [{ from }],
        ...(sameOwner ? { sameOwner: true, modeChanges: [settled] } : {}),
      };
      tx.create(recordRef, {
        ...created,
        ...(sameOwner ? {} : offeredRate(created, invite, now)),
        ...extra,
      });
    } else {
      if (held.status !== 'left' && held.status !== 'removed' && !takenBack) {
        fail('failed-precondition', 'This corporation already feeds this book', 'feeder-active');
      }
      rejoined = true;
      priorRecord = held;
      const kept: FeederRecord = { ...held };
      for (const key of FEED_STATE) delete kept[key];
      const reopened: FeederRecord = {
        ...kept,
        status: 'active',
        invitedBy: invite.createdBy,
        joinedAt: now,
        ...(sameOwner ? {} : offeredRate(held, invite, now)),
        coveragePeriods: reopenPeriod(held.coveragePeriods, from),
        ...(sameOwner
          ? {
              sameOwner: true,
              mode: 'settled-otherwise' as const,
              modeChanges: [...deriveModeChanges(held), settled],
            }
          : {}),
        ...extra,
      };
      tx.set(recordRef, reopened);
    }
    tx.set(pointerRef, { collectorCorporationId: collector, since: now });
    const accepted: Partial<FeederInviteDoc> = {
      acceptedBy: characterId,
      acceptedAt: now,
      acceptedByCorporationId: feederCorp,
    };
    tx.update(inviteRef(deps.db, inviteId), accepted);
    appendAudit(
      tx,
      deps,
      collector,
      { characterId, name: claims.name },
      rejoined ? 'feederRejoined' : 'feederJoined',
      {
        feederCorporationId: feederCorp,
        inviteId,
        ...(sameOwner || held?.sameOwner ? { sameOwner: true } : {}),
      }
    );
    return {
      collectorCorporationId: collector,
      feederCorporationId: feederCorp,
      rejoined,
      undo: {
        inviteId,
        ...(priorRecord ? { priorRecord } : {}),
        ...(pointer ? { priorPointer: pointer } : {}),
      },
    };
  });
}
