// Corp Tax Book (issue #4061, ADR 0023): the admin-SDK half of the callables.
// Pure decisions, parsing and the layout are in corpTaxBook.ts. Every write to
// the book goes through here and appends to the immutable audit log in the
// same transaction; clients have no write path (firestore.rules). The caller's
// EVE access token is verified and used for ESI reads, then dropped: it is
// never written to Firestore or to the audit log.

import { randomBytes } from 'node:crypto';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import {
  ACCESS_TTL_MS,
  ADJUSTMENTS,
  AUDIT,
  BOOKS_COLLECTION,
  DECLARATIONS,
  DISMISSALS,
  EXTRACTIONS,
  LIVE_CHECK_ACTIONS,
  META,
  MINERS,
  OBSERVED,
  OFFICERS,
  PAID_DOC,
  PAYMENTS,
  REBILLS,
  STATEMENTS,
  STATEMENT_LINKS,
  TOKENS_COLLECTION,
  WRITE_OFFS,
  decideRoles,
  defaultSettings,
  isCacheFresh,
  parseRecordKey,
  parseStatement,
  satisfies,
  utcDate,
  type BookCall,
  type EditAction,
  type Need,
  type OfficerAccess,
  type OfficerRoles,
  type StoredRate,
  type SyncInput,
  type TurnOnInput,
} from './corpTaxBook.js';
import {
  canOverrideRecordRate,
  canRebillFrom,
  isRetroactiveRate,
  mergeObservedRows,
  observedRowKey,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import { ROLES_SCOPE, type IdentityReader } from './corpTaxBookEsi.js';
import { characterIdForUid, type EveTokenClaims } from './verifyEveToken.js';

export interface BookDeps {
  db: Firestore;
  now: () => number;
  verifyToken: (accessToken: string) => Promise<EveTokenClaims>;
  readIdentity: IdentityReader;
}

/** Who is calling: the Firebase uid `char:{id}` and the ownerHash claim. */
export interface Caller {
  uid: string;
  ownerHash: string;
}

type Data = Record<string, unknown>;

export const bookRef = (db: Firestore, corporationId: number) =>
  db.collection(BOOKS_COLLECTION).doc(String(corporationId));
const sub = (db: Firestore, corporationId: number, name: string) =>
  bookRef(db, corporationId).collection(name);

const rand = (bytes = 6) => randomBytes(bytes).toString('base64url');

function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

// --- Officer verification --------------------------------------------------

export interface AuthOptions {
  /** Ignore the 10-minute role cache: needs the access token. */
  live: boolean;
}

/**
 * Establishes what the caller may do in the corporation's book. With an access
 * token the function reads corporation and roles from ESI (or reuses a check
 * younger than 10 minutes when `live` is false); without one it trusts only a
 * check younger than 10 minutes. The officer access record is (re)written
 * whenever a book exists and the caller can view it.
 */
export async function authorizeOfficer(
  deps: BookDeps,
  caller: Caller,
  call: BookCall,
  need: Need,
  options: AuthOptions
): Promise<OfficerAccess> {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  const now = deps.now();
  const officerRef = sub(deps.db, call.corporationId, OFFICERS).doc(caller.uid);
  const held = (await officerRef.get()).data() as OfficerAccess | undefined;
  const heldUsable =
    held !== undefined &&
    held.ownerHash === caller.ownerHash &&
    held.corporationId === call.corporationId &&
    held.expiresAt > now &&
    isCacheFresh(held.checkedAt, now);

  let access: OfficerAccess;
  if (call.accessToken === undefined) {
    if (!heldUsable) {
      fail(
        held ? 'failed-precondition' : 'permission-denied',
        'Verify as an officer first',
        held ? 'officer-check-stale' : 'not-an-officer'
      );
    }
    if (options.live)
      fail('failed-precondition', 'This needs a fresh role check', 'live-check-required');
    access = held;
  } else {
    let claims: EveTokenClaims;
    try {
      claims = await deps.verifyToken(call.accessToken);
    } catch {
      // Opaque on purpose; mintFirebaseToken logs the cause.
      throw new HttpsError('unauthenticated', 'EVE access token rejected');
    }
    if (claims.characterId !== characterId || claims.ownerHash !== caller.ownerHash) {
      fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
    }
    if (!options.live && heldUsable) {
      access = held;
    } else {
      if (!claims.scopes.includes(ROLES_SCOPE)) {
        fail('failed-precondition', 'Grant the corporation roles scope first', 'missing-scope');
      }
      const identity = await deps.readIdentity(characterId, call.accessToken);
      if (identity.corporationId !== call.corporationId) {
        if (held) await officerRef.delete();
        fail('permission-denied', 'Not a member of this corporation', 'wrong-corp');
      }
      const roles = decideRoles(identity.roles, identity.ceoId === characterId);
      if (!roles.canView) {
        // A failed renewal revokes the read access the old check granted.
        if (held) await officerRef.delete();
        fail('permission-denied', 'No officer role in this corporation', 'not-an-officer');
      }
      access = {
        ...roles,
        characterId,
        characterName: claims.name,
        ownerHash: caller.ownerHash,
        corporationId: call.corporationId,
        roles: identity.roles,
        checkedAt: now,
        expiresAt: now + ACCESS_TTL_MS,
      };
      if ((await bookRef(deps.db, call.corporationId).get()).exists) await officerRef.set(access);
    }
  }
  if (!satisfies(access, need)) {
    throw new HttpsError('permission-denied', `This needs the ${need} role`, {
      reason: 'role-required',
      need,
    });
  }
  return access;
}

export interface VerifyOfficerResult extends OfficerRoles {
  corporationId: number;
  bookActive: boolean;
  expiresAt: number;
}

export async function verifyOfficer(
  deps: BookDeps,
  caller: Caller,
  call: BookCall
): Promise<VerifyOfficerResult> {
  if (call.accessToken === undefined)
    fail('invalid-argument', 'accessToken is required', 'token-required');
  const access = await authorizeOfficer(deps, caller, call, 'view', { live: false });
  const book = (await bookRef(deps.db, call.corporationId).get()).data();
  return {
    corporationId: call.corporationId,
    isCeo: access.isCeo,
    isDirector: access.isDirector,
    isStationManager: access.isStationManager,
    canView: access.canView,
    canEdit: access.canEdit,
    bookActive: book?.active === true,
    expiresAt: access.expiresAt,
  };
}

// --- Audit -----------------------------------------------------------------

interface Actor {
  characterId: number | null;
  name: string;
  via?: string;
}

function appendAudit(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  actor: Actor,
  action: string,
  detail: Data
): void {
  const at = deps.now();
  const id = `${String(at).padStart(15, '0')}~${rand()}`;
  tx.create(sub(deps.db, corporationId, AUDIT).doc(id), {
    at,
    by: actor.characterId,
    byName: actor.name,
    ...(actor.via ? { via: actor.via } : {}),
    action,
    detail,
  });
}

const actorOf = (access: OfficerAccess): Actor => ({
  characterId: access.characterId,
  name: access.characterName,
});

// --- Turn on / reclaim -----------------------------------------------------

export async function turnOnBook(deps: BookDeps, caller: Caller, input: TurnOnInput) {
  const access = await authorizeOfficer(deps, caller, input, 'director', { live: true });
  const now = deps.now();
  if (input.startDate > utcDate(now))
    fail('invalid-argument', 'The start date cannot be in the future', 'start-in-future');
  const ref = bookRef(deps.db, input.corporationId);
  await deps.db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists)
      fail('already-exists', 'This corporation already has a Corp Tax Book', 'book-exists');
    tx.create(ref, {
      ...defaultSettings(input.startDate, input.startRatePct),
      corporationId: input.corporationId,
      active: true,
      ownerCharacterId: access.characterId,
      createdAt: now,
      createdBy: access.characterId,
      lastSync: null,
      schemaVersion: 1,
    });
    tx.set(sub(deps.db, input.corporationId, OFFICERS).doc(caller.uid), access);
    appendAudit(tx, deps, input.corporationId, actorOf(access), 'turnOn', {
      startDate: input.startDate,
      startRatePct: input.startRatePct,
    });
  });
  return { corporationId: input.corporationId };
}

/** The CEO can always reclaim the book: becomes owner, and every other officer must re-verify. */
export async function reclaimBook(deps: BookDeps, caller: Caller, call: BookCall) {
  const access = await authorizeOfficer(deps, caller, call, 'ceo', { live: true });
  const now = deps.now();
  const ref = bookRef(deps.db, call.corporationId);
  const revoked = await deps.db.runTransaction(async (tx) => {
    const book = await tx.get(ref);
    if (!book.exists) fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
    const officers = await tx.get(sub(deps.db, call.corporationId, OFFICERS));
    let count = 0;
    for (const doc of officers.docs) {
      if (doc.id === caller.uid) continue;
      tx.delete(doc.ref);
      count += 1;
    }
    tx.update(ref, { active: true, ownerCharacterId: access.characterId, reclaimedAt: now });
    tx.set(
      officers.docs.find((d) => d.id === caller.uid)?.ref ??
        sub(deps.db, call.corporationId, OFFICERS).doc(caller.uid),
      access
    );
    appendAudit(tx, deps, call.corporationId, actorOf(access), 'reclaim', {
      officersRevoked: count,
    });
    return count;
  });
  return { officersRevoked: revoked };
}

// --- Sync ------------------------------------------------------------------

const CHUNK = 200;
const obsId = (r: ObservedRow) => `${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`;

export async function syncBook(deps: BookDeps, caller: Caller, input: SyncInput) {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: false });
  const book = bookRef(deps.db, input.corporationId);
  if (!(await book.get()).exists)
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  if (input.extractions.length > 0 && !access.isStationManager) {
    fail(
      'permission-denied',
      'Extractions need the Station_Manager role',
      'station-manager-required'
    );
  }

  let observedChanged = 0;
  for (let i = 0; i < input.observed.length; i += CHUNK) {
    const chunk = input.observed.slice(i, i + CHUNK);
    const col = sub(deps.db, input.corporationId, OBSERVED);
    observedChanged += await deps.db.runTransaction(async (tx) => {
      const unique = [...new Map(chunk.map((r) => [obsId(r), r])).values()];
      const refs = unique.map((r) => col.doc(obsId(r)));
      const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
      const existing = snaps.filter((s) => s.exists).map((s) => s.data() as ObservedRow);
      const { changed } = mergeObservedRows(existing, chunk);
      const last = new Map(changed.map((r) => [observedRowKey(r), r]));
      for (const row of last.values()) {
        tx.set(col.doc(obsId(row)), { ...row, uid: `char:${row.characterId}` });
      }
      return last.size;
    });
  }

  const extractions = sub(deps.db, input.corporationId, EXTRACTIONS);
  for (const x of input.extractions) {
    const id = `${x.structureId}_${Date.parse(x.extractionStartTime)}`;
    const fields: Data = { ...x, id };
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
    await extractions.doc(id).set(fields, { merge: true });
  }

  const payments = sub(deps.db, input.corporationId, PAYMENTS);
  let donationsAdded = 0;
  for (const dn of input.donations) {
    const id = `j${dn.division}_${dn.refId}`;
    const data: Data = {
      id,
      source: 'donation',
      characterId: dn.characterId,
      uid: `char:${dn.characterId}`,
      amount: dn.amount,
      at: dn.at,
      division: dn.division,
      ...(dn.reason !== undefined ? { reason: dn.reason } : {}),
      ...(dn.minerId !== undefined ? { minerId: dn.minerId } : {}),
      ...(dn.statementId !== undefined ? { statementId: dn.statementId } : {}),
    };
    try {
      // create(): a re-synced donation never overwrites an officer's "not tax" mark.
      await payments.doc(id).create(data);
      donationsAdded += 1;
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err;
    }
  }

  const now = deps.now();
  await deps.db.runTransaction(async (tx) => {
    tx.update(book, {
      lastSync: {
        at: now,
        byCharacterId: access.characterId,
        byName: access.characterName,
        gaps: input.gaps,
      },
    });
    appendAudit(tx, deps, input.corporationId, actorOf(access), 'sync', {
      observedChanged,
      extractions: input.extractions.length,
      donationsAdded,
      gaps: input.gaps.length,
    });
  });
  return { observedChanged, extractions: input.extractions.length, donationsAdded };
}

// --- Edits -----------------------------------------------------------------

interface EditCtx {
  deps: BookDeps;
  tx: Transaction;
  corporationId: number;
  book: Data;
  access: OfficerAccess;
  now: number;
}

interface EditOutcome {
  detail: Data;
  result?: Data;
}

const col = (c: EditCtx, name: string) => sub(c.deps.db, c.corporationId, name);

async function mustGet(c: EditCtx, ref: DocumentReference, what: string): Promise<Data> {
  const snap = await c.tx.get(ref);
  if (!snap.exists) fail('not-found', `${what} not found`, 'not-found');
  return snap.data() as Data;
}

function minerCharacters(minerId: string, miner: Data | undefined): number[] {
  if (miner) return miner.characterIds as number[];
  const solo = /^solo:(\d+)$/.exec(minerId);
  return solo ? [Number(solo[1])] : [];
}

const rateKey = (r: StoredRate): string =>
  r.scope === 'record'
    ? `record:${r.recordKey}`
    : `${r.scope}:${'minerId' in r ? r.minerId : ''}:${'moonId' in r ? r.moonId : ''}:${r.effectiveFrom}`;

async function applyEdit(c: EditCtx, action: EditAction): Promise<EditOutcome> {
  const { tx, now } = c;
  const iso = new Date(now).toISOString();
  const by = c.access.characterId;
  const bookDoc = bookRef(c.deps.db, c.corporationId);
  const rates = (c.book.rates as StoredRate[] | undefined) ?? [];

  switch (action.action) {
    case 'addRate': {
      if (isRetroactiveRate(action.rate.effectiveFrom, utcDate(now))) {
        fail('failed-precondition', 'A rate cannot start before today', 'retroactive-rate');
      }
      const next = [...rates.filter((r) => rateKey(r) !== rateKey(action.rate)), action.rate];
      if (next.length > 500) fail('resource-exhausted', 'Too many rates', 'too-many-rates');
      tx.update(bookDoc, { rates: next });
      return { detail: { rate: action.rate } };
    }
    case 'setRecordRate': {
      const { characterId, date } = parseRecordKey(action.recordKey);
      const onChar = await tx.get(
        col(c, STATEMENTS).where('characterIds', 'array-contains', characterId)
      );
      if (
        !canOverrideRecordRate(
          date,
          onChar.docs.map((d) => d.data() as never)
        )
      ) {
        fail('failed-precondition', 'That day is already on a Statement', 'day-on-statement');
      }
      const rate: StoredRate = { scope: 'record', recordKey: action.recordKey, pct: action.pct };
      tx.update(bookDoc, { rates: [...rates.filter((r) => rateKey(r) !== rateKey(rate)), rate] });
      return { detail: { recordKey: action.recordKey, pct: action.pct, reason: action.reason } };
    }
    case 'updateSettings': {
      if (action.patch.dismissApprovalAboveIsk !== undefined && !c.access.isDirector) {
        throw new HttpsError('permission-denied', 'Only a Director sets the approval limit', {
          reason: 'director-approval',
        });
      }
      const { structureExpiryHours, dismissApprovalAboveIsk, ...rest } = action.patch;
      const update: Data = { ...rest };
      if (structureExpiryHours) {
        update.structureExpiryHours = {
          ...(c.book.structureExpiryHours as Data | undefined),
          ...structureExpiryHours,
        };
      }
      if (dismissApprovalAboveIsk !== undefined) {
        update.dismissApprovalAboveIsk =
          dismissApprovalAboveIsk === null ? FieldValue.delete() : dismissApprovalAboveIsk;
      }
      tx.update(bookDoc, update);
      return { detail: { patch: action.patch as Data } };
    }
    case 'recordPayment': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      if ((await tx.get(ref)).exists)
        fail('already-exists', 'A payment with that id exists', 'payment-exists');
      tx.create(ref, {
        id: action.paymentId,
        source: 'manual',
        minerId: action.minerId,
        characterId: action.characterId,
        uid: `char:${action.characterId}`,
        amount: action.amount,
        at: action.at,
        ...(action.statementId ? { statementId: action.statementId } : {}),
        ...(action.note ? { note: action.note } : {}),
        recordedBy: by,
      });
      return {
        detail: { paymentId: action.paymentId, minerId: action.minerId, amount: action.amount },
      };
    }
    case 'markNotTax': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      const payment = await mustGet(c, ref, 'Payment');
      if (action.notTaxAmount > (payment.amount as number)) {
        fail('invalid-argument', 'More than the payment', 'not-tax-too-large');
      }
      tx.update(ref, {
        notTaxAmount: action.notTaxAmount,
        notTaxReason: action.reason,
        notTaxBy: by,
        notTaxAt: iso,
      });
      return {
        detail: {
          paymentId: action.paymentId,
          notTaxAmount: action.notTaxAmount,
          reason: action.reason,
        },
      };
    }
    case 'assignPayment': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      const payment = await mustGet(c, ref, 'Payment');
      if (payment.minerId !== undefined)
        fail('failed-precondition', 'Already assigned', 'already-assigned');
      tx.update(ref, { minerId: action.minerId, assignedBy: by });
      return { detail: { paymentId: action.paymentId, minerId: action.minerId } };
    }
    case 'dismiss': {
      const limit = c.book.dismissApprovalAboveIsk;
      // An omitted amount cannot dodge the gate: with a limit set it counts as over it.
      if (
        typeof limit === 'number' &&
        (action.amountIsk ?? Infinity) > limit &&
        !c.access.isDirector
      ) {
        throw new HttpsError(
          'permission-denied',
          'A Director must approve this size of dismissal',
          { reason: 'director-approval' }
        );
      }
      const id = `d${now}_${rand(4)}`;
      let uids: string[] = [];
      if (action.scope === 'record') {
        const characterId = Number(action.targetId.split(':')[0]);
        uids = Number.isSafeInteger(characterId) ? [`char:${characterId}`] : [];
      } else if (action.scope === 'miner') {
        const miner = (await tx.get(col(c, MINERS).doc(action.targetId))).data();
        uids = minerCharacters(action.targetId, miner).map((id2) => `char:${id2}`);
      }
      tx.create(col(c, DISMISSALS).doc(id), {
        id,
        scope: action.scope,
        targetId: action.targetId,
        by,
        at: iso,
        reason: action.reason,
        uids,
        ...(action.amountIsk !== undefined ? { amountIsk: action.amountIsk } : {}),
      });
      return {
        detail: {
          dismissalId: id,
          scope: action.scope,
          targetId: action.targetId,
          reason: action.reason,
        },
        result: { dismissalId: id },
      };
    }
    case 'reverseDismissal': {
      const ref = col(c, DISMISSALS).doc(action.dismissalId);
      const dismissal = await mustGet(c, ref, 'Dismissal');
      if (dismissal.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
      tx.update(ref, { reversed: { by, at: iso, reason: action.reason } });
      return { detail: { dismissalId: action.dismissalId, reason: action.reason } };
    }
    case 'setMiner': {
      const miners = await tx.get(col(c, MINERS));
      const mine = miners.docs.find((d) => d.id === action.minerId)?.data();
      const clash = miners.docs.find(
        (d) =>
          d.id !== action.minerId &&
          (d.data().characterIds as number[]).some((x) => action.characterIds.includes(x))
      );
      if (clash)
        fail('failed-precondition', 'A character is already in another Miner', 'already-grouped');
      // Characters outside the corp are not linked until they confirm (D26b).
      const confirmed = new Set<number>(
        (mine?.confirmedCharacterIds as number[] | undefined) ?? []
      );
      const outsiders = new Set<number>();
      for (const characterId of action.characterIds) {
        const rows = await tx.get(
          col(c, OBSERVED).where('characterId', '==', characterId).select('recordedCorporationId')
        );
        if (rows.docs.some((d) => d.get('recordedCorporationId') !== c.corporationId))
          outsiders.add(characterId);
      }
      const pending = [...outsiders].filter((x) => !confirmed.has(x));
      tx.set(col(c, MINERS).doc(action.minerId), {
        id: action.minerId,
        characterIds: action.characterIds,
        mainCharacterId: action.mainCharacterId,
        pendingConfirmation: pending,
        confirmedCharacterIds: [...confirmed].filter((x) => action.characterIds.includes(x)),
        // A guest's character stays out of the readable grouping until it confirms (D26b).
        uids: action.characterIds.filter((x) => !pending.includes(x)).map((x) => `char:${x}`),
      });
      return {
        detail: { minerId: action.minerId, characterIds: action.characterIds, pending },
        result: { pendingConfirmation: pending },
      };
    }
    case 'unlink': {
      const ref = col(c, MINERS).doc(action.minerId);
      const miner = await mustGet(c, ref, 'Miner');
      const characterIds = (miner.characterIds as number[]).filter((x) => x !== action.characterId);
      if (characterIds.length === (miner.characterIds as number[]).length)
        fail('not-found', 'Not in that Miner', 'not-in-miner');
      if (characterIds.length <= 1) {
        tx.delete(ref);
      } else {
        tx.update(ref, {
          characterIds,
          mainCharacterId: characterIds.includes(miner.mainCharacterId as number)
            ? miner.mainCharacterId
            : characterIds[0],
          pendingConfirmation: (miner.pendingConfirmation as number[]).filter(
            (x) => x !== action.characterId
          ),
          confirmedCharacterIds: (miner.confirmedCharacterIds as number[]).filter(
            (x) => x !== action.characterId
          ),
          uids: characterIds.map((x) => `char:${x}`),
        });
      }
      return { detail: { minerId: action.minerId, characterId: action.characterId } };
    }
    case 'addAdjustment': {
      const id = `a${now}_${rand(4)}`;
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId: action.minerId,
        date: action.date,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
      });
      return {
        detail: {
          adjustmentId: id,
          minerId: action.minerId,
          amount: action.amount,
          reason: action.reason,
        },
        result: { adjustmentId: id },
      };
    }
    case 'writeOff': {
      if (action.statementId) {
        const statement = await mustGet(c, col(c, STATEMENTS).doc(action.statementId), 'Statement');
        if (statement.minerId !== action.minerId)
          fail('invalid-argument', "Statement is another Miner's", 'wrong-miner');
      }
      const id = `w${now}_${rand(4)}`;
      tx.create(col(c, WRITE_OFFS).doc(id), {
        id,
        minerId: action.minerId,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        ...(action.statementId ? { statementId: action.statementId } : {}),
      });
      return {
        detail: {
          writeOffId: id,
          minerId: action.minerId,
          amount: action.amount,
          reason: action.reason,
        },
        result: { writeOffId: id },
      };
    }
    case 'rebill': {
      const [statements, paidDoc, minerDoc] = await Promise.all([
        tx.get(col(c, STATEMENTS).where('minerId', '==', action.minerId)),
        tx.get(col(c, META).doc(PAID_DOC)),
        tx.get(col(c, MINERS).doc(action.minerId)),
      ]);
      const paid = new Set<string>((paidDoc.data()?.ids as string[] | undefined) ?? []);
      if (
        !canRebillFrom(
          action.fromDate,
          statements.docs.map((d) => d.data() as never),
          paid
        )
      ) {
        fail('failed-precondition', 'A paid Statement covers that day', 'paid-days-closed');
      }
      // A rebill that touches a corp member's days needs a Director (D22).
      let touchesMember = false;
      for (const characterId of minerCharacters(action.minerId, minerDoc.data())) {
        const rows = await tx.get(
          col(c, OBSERVED)
            .where('characterId', '==', characterId)
            .select('recordedCorporationId', 'date')
        );
        if (
          rows.docs.some(
            (d) =>
              d.get('date') >= action.fromDate && d.get('recordedCorporationId') === c.corporationId
          )
        ) {
          touchesMember = true;
        }
      }
      if (touchesMember && !c.access.isDirector) {
        throw new HttpsError('permission-denied', 'Rebilling a member needs a Director', {
          reason: 'director-approval',
        });
      }
      const id = `r${now}_${rand(4)}`;
      tx.create(col(c, REBILLS).doc(id), {
        id,
        minerId: action.minerId,
        fromDate: action.fromDate,
        reason: action.reason,
        by,
        at: iso,
        memberRebill: touchesMember,
      });
      return {
        detail: {
          rebillId: id,
          minerId: action.minerId,
          fromDate: action.fromDate,
          reason: action.reason,
        },
        result: { rebillId: id },
      };
    }
    case 'issueStatement': {
      const statement = parseStatement(action.statement);
      const ref = col(c, STATEMENTS).doc(statement.id);
      if ((await tx.get(ref)).exists)
        fail('already-exists', 'An issued Statement never changes', 'statement-exists');
      const token = randomBytes(32).toString('base64url');
      tx.create(ref, {
        ...statement,
        uids: statement.characterIds.map((x) => `char:${x}`),
        remindersStopped: false,
        manualRemindersSent: 0,
        issuedBy: by,
      });
      // The link lives beside the Statement, readable by editors only (rules): the
      // miner and view-only officers never see it.
      tx.create(col(c, STATEMENT_LINKS).doc(statement.id), { verifyToken: token });
      tx.create(c.deps.db.collection(TOKENS_COLLECTION).doc(token), {
        corporationId: c.corporationId,
        statementId: statement.id,
        minerId: statement.minerId,
        remindersStopped: false,
        createdAt: now,
      });
      return {
        detail: { statementId: statement.id, minerId: statement.minerId, amount: statement.amount },
        result: { statementId: statement.id, verifyToken: token },
      };
    }
    case 'settleStatements': {
      const paidRef = col(c, META).doc(PAID_DOC);
      const paid = new Set<string>(
        ((await tx.get(paidRef)).data()?.ids as string[] | undefined) ?? []
      );
      const fresh = [...new Set(action.statementIds)].filter((id) => !paid.has(id));
      for (const id of fresh) await mustGet(c, col(c, STATEMENTS).doc(id), 'Statement');
      if (fresh.length > 0) {
        // Only ever grown: a Statement settled once keeps its days closed for good (D22).
        tx.set(
          paidRef,
          {
            ids: FieldValue.arrayUnion(...fresh),
            settled: Object.fromEntries(fresh.map((id) => [id, { at: iso, by }])),
          },
          { merge: true }
        );
      }
      return { detail: { statementIds: fresh }, result: { settled: fresh } };
    }
    case 'declare': {
      await mustGet(c, col(c, STATEMENTS).doc(action.statementId), 'Statement');
      const id = `x${now}_${rand(4)}`;
      tx.create(col(c, DECLARATIONS).doc(id), {
        id,
        statementId: action.statementId,
        kind: action.kind,
        at: iso,
        recordedBy: by,
        ...(action.note ? { note: action.note } : {}),
      });
      return {
        detail: { declarationId: id, statementId: action.statementId, kind: action.kind },
        result: { declarationId: id },
      };
    }
    case 'resolveDeclaration': {
      const ref = col(c, DECLARATIONS).doc(action.declarationId);
      const declaration = await mustGet(c, ref, 'Declaration');
      if (declaration.resolution)
        fail('failed-precondition', 'Already resolved', 'already-resolved');
      tx.update(ref, {
        resolution: {
          kind: action.resolution,
          at: iso,
          by,
          ...(action.reason ? { reason: action.reason } : {}),
        },
      });
      return {
        detail: {
          declarationId: action.declarationId,
          resolution: action.resolution,
          ...(action.reason ? { reason: action.reason } : {}),
        },
      };
    }
    case 'recordReminder': {
      const ref = col(c, STATEMENTS).doc(action.statementId);
      const statement = await mustGet(c, ref, 'Statement');
      // A miner who opted out gets one manual reminder per Statement (D27).
      if (statement.remindersStopped === true && (statement.manualRemindersSent as number) >= 1) {
        fail('failed-precondition', 'This miner stopped reminders', 'reminders-stopped');
      }
      tx.update(ref, { manualRemindersSent: FieldValue.increment(1) });
      return { detail: { statementId: action.statementId } };
    }
  }
}

export async function editBook(deps: BookDeps, caller: Caller, call: BookCall, action: EditAction) {
  const access = await authorizeOfficer(deps, caller, call, 'edit', {
    live: LIVE_CHECK_ACTIONS.has(action.action),
  });
  const ref = bookRef(deps.db, call.corporationId);
  return deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('active') !== true)
      fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
    const ctx: EditCtx = {
      deps,
      tx,
      corporationId: call.corporationId,
      book: snap.data() as Data,
      access,
      now: deps.now(),
    };
    const outcome = await applyEdit(ctx, action);
    appendAudit(tx, deps, call.corporationId, actorOf(access), action.action, outcome.detail);
    return outcome.result ?? {};
  });
}

/** A guest or member confirms their own character into a Miner grouping (D26b). */
export async function confirmGrouping(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  minerId: string
) {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  const ref = sub(deps.db, corporationId, MINERS).doc(minerId);
  await deps.db.runTransaction(async (tx) => {
    const miner = (await tx.get(ref)).data();
    if (!miner || !(miner.pendingConfirmation as number[]).includes(characterId)) {
      fail('not-found', 'Nothing to confirm', 'nothing-pending');
    }
    tx.update(ref, {
      pendingConfirmation: (miner.pendingConfirmation as number[]).filter((x) => x !== characterId),
      confirmedCharacterIds: FieldValue.arrayUnion(characterId),
      uids: FieldValue.arrayUnion(caller.uid),
    });
    appendAudit(tx, deps, corporationId, { characterId, name: '' }, 'confirmGrouping', { minerId });
  });
}

// --- Verify link -----------------------------------------------------------

export async function readStatementByToken(deps: BookDeps, token: string) {
  const tokenSnap = await deps.db.collection(TOKENS_COLLECTION).doc(token).get();
  if (!tokenSnap.exists) fail('not-found', 'Verify link is not valid', 'invalid-token');
  const { corporationId, statementId, minerId } = tokenSnap.data() as {
    corporationId: number;
    statementId: string;
    minerId: string;
  };
  const [book, statement, payments, paid, declarations] = await Promise.all([
    bookRef(deps.db, corporationId).get(),
    sub(deps.db, corporationId, STATEMENTS).doc(statementId).get(),
    sub(deps.db, corporationId, PAYMENTS).where('minerId', '==', minerId).get(),
    sub(deps.db, corporationId, META).doc(PAID_DOC).get(),
    sub(deps.db, corporationId, DECLARATIONS).where('statementId', '==', statementId).get(),
  ]);
  const s = statement.data() as Data;
  const { verifyToken: _omit, uids: _uids, ...shown } = s;
  void _omit;
  void _uids;
  const b = book.data() ?? {};
  return {
    statement: shown,
    terms: {
      hubId: s.hubId,
      oreForm: s.oreForm,
      startDate: b.startDate,
      overdueDays: b.overdueDays,
    },
    payments: payments.docs.map((d) => {
      const p = d.data();
      return {
        id: d.id,
        amount: p.amount,
        notTaxAmount: p.notTaxAmount ?? 0,
        at: p.at,
        statementId: p.statementId ?? null,
      };
    }),
    declarations: declarations.docs.map((d) => {
      const x = d.data();
      return { kind: x.kind, at: x.at, resolution: x.resolution ?? null };
    }),
    settled: ((paid.data()?.ids as string[] | undefined) ?? []).includes(statementId),
    remindersStopped: s.remindersStopped === true,
  };
}

/** The one write the verify link allows: the miner's "Stop reminders" toggle, audited like every write. */
export async function setRemindersByToken(deps: BookDeps, token: string, stopped: boolean) {
  const tokenRef = deps.db.collection(TOKENS_COLLECTION).doc(token);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(tokenRef);
    if (!snap.exists) fail('not-found', 'Verify link is not valid', 'invalid-token');
    const { corporationId, statementId, minerId } = snap.data() as {
      corporationId: number;
      statementId: string;
      minerId: string;
    };
    tx.update(tokenRef, { remindersStopped: stopped });
    tx.update(sub(deps.db, corporationId, STATEMENTS).doc(statementId), {
      remindersStopped: stopped,
    });
    // The audit entry names the Statement, never the token.
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId: null, name: 'Miner (verify link)', via: 'verify-link' },
      'stopReminders',
      { statementId, minerId, stopped }
    );
  });
  return { stopped };
}
