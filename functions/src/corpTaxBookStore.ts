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
  type QueryDocumentSnapshot,
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
  FEEDER_INVITES_COLLECTION,
  BILLED_BY_COLLECTION,
  FEEDER_OF_COLLECTION,
  MEMBER_SETUP_MS,
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
  needsLiveCheck,
  dismissalNeedsDirector,
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
  type StoredStatement,
  type SyncInput,
  type TurnOnInput,
} from './corpTaxBook.js';
import {
  allocatePayments,
  dismissalCredits,
  forfeitAllowed,
  canOverrideRecordRate,
  canRebillFrom,
  isRetroactiveRate,
  mergeObservedRows,
  observedRowKey,
  type DismissableLine,
  type MirrorDismissal,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import { ROLES_SCOPE, type IdentityReader } from './corpTaxBookEsi.js';
import { characterIdForUid, type EveTokenClaims } from './verifyEveToken.js';

/** One type's parsed R2 `open-prices/<typeId>.json` object, or null when R2 has none. Throws on a failed read. */
export type OpenPricesReader = (typeId: number) => Promise<unknown | null>;

export interface BookDeps {
  db: Firestore;
  now: () => number;
  verifyToken: (accessToken: string) => Promise<EveTokenClaims>;
  readIdentity: IdentityReader;
  /** Prices the feeder view (issue #4512); absent in tests that never rebuild one. */
  openPrices?: OpenPricesReader;
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

export interface Actor {
  characterId: number | null;
  name: string;
  via?: string;
}

export function appendAudit(
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

/** How the scheduled sync (ADR 0025) appears in the audit log: the holder, `via` the schedule. */
export const SCHEDULED_VIA = 'scheduled sync';

const actorOf = (access: OfficerAccess, via?: string): Actor => ({
  characterId: access.characterId,
  name: access.characterName,
  ...(via ? { via } : {}),
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
    // A corporation feeds another book or runs its own, never both (#4507).
    if (
      (await tx.get(deps.db.collection(FEEDER_OF_COLLECTION).doc(String(input.corporationId))))
        .exists
    )
      fail('failed-precondition', 'This corporation feeds another book', 'is-a-feeder');
    tx.create(ref, {
      ...defaultSettings(input.startDate, input.startRatePct),
      corporationId: input.corporationId,
      active: true,
      ownerCharacterId: access.characterId,
      createdAt: now,
      createdBy: access.characterId,
      lastSync: null,
      membersSeeFrom: now + MEMBER_SETUP_MS,
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

/**
 * The player who turned the book on (or the CEO) deletes it outright: the book,
 * everything under it and its Statement verify links. `beforeDelete` lets the
 * caller drop what lives outside the book first (the scheduled-sync grant), so a
 * failure there leaves the book standing. Turning the book on again starts clean.
 */
export async function deleteBook(
  deps: BookDeps,
  caller: Caller,
  call: BookCall,
  beforeDelete: (corporationId: number) => Promise<void> = async () => {}
) {
  const access = await authorizeOfficer(deps, caller, call, 'director', { live: true });
  const ref = bookRef(deps.db, call.corporationId);
  const book = await ref.get();
  if (!book.exists) fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  const openedBy = [book.get('createdBy'), book.get('ownerCharacterId')];
  if (!access.isCeo && !openedBy.includes(access.characterId)) {
    fail(
      'permission-denied',
      'Only whoever turned the book on, or the CEO, can delete it',
      'not-opener'
    );
  }
  await beforeDelete(call.corporationId);
  const links = await deps.db
    .collection(TOKENS_COLLECTION)
    .where('corporationId', '==', call.corporationId)
    .get();
  await Promise.all(links.docs.map((d) => d.ref.delete()));
  // Invite links and feeder pointers live outside the book; the feeder records go with it.
  for (const name of [FEEDER_INVITES_COLLECTION, FEEDER_OF_COLLECTION]) {
    const stray = await deps.db
      .collection(name)
      .where('collectorCorporationId', '==', call.corporationId)
      .get();
    await Promise.all(stray.docs.map((d) => d.ref.delete()));
  }
  await deps.db.recursiveDelete(ref);
  // A scheduled sync that loaded its grant before it was dropped may still have been writing.
  await deps.db.recursiveDelete(ref);
  return { deleted: true };
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
  return syncBookAs(deps, access, input);
}

/**
 * Merge Observed Rows into a book monotonically (a stale row never replaces a
 * fresher one). Shared by an officer's or the scheduled sync and a feeder's pull,
 * which must not touch the book's `lastSync` or gaps.
 */
export async function mergeObservedInto(
  deps: BookDeps,
  corporationId: number,
  rows: readonly ObservedRow[]
): Promise<number> {
  let observedChanged = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const col = sub(deps.db, corporationId, OBSERVED);
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
  await writeBilledByPointers(deps, corporationId, rows);
  return observedChanged;
}

/**
 * Points each Character the book observed at the book (`corpTaxBookBilledBy`), so
 * the miner's client finds it whatever corporation they are in now. Refreshed on
 * every sync; a failure never fails the sync, the next one writes it again.
 */
async function writeBilledByPointers(
  deps: BookDeps,
  corporationId: number,
  rows: readonly ObservedRow[]
): Promise<void> {
  const characterIds = [...new Set(rows.map((r) => r.characterId))];
  const at = Date.now();
  for (let i = 0; i < characterIds.length; i += CHUNK) {
    const batch = deps.db.batch();
    for (const characterId of characterIds.slice(i, i + CHUNK)) {
      batch.set(
        deps.db.collection(BILLED_BY_COLLECTION).doc(`char:${characterId}`),
        { books: { [String(corporationId)]: at } },
        { merge: true }
      );
    }
    await batch.commit().catch(() => undefined);
  }
}

/**
 * The sync once the caller is established. The scheduled sync (ADR 0025) calls
 * this with the role check it just made with the grant holder's token, and
 * `scheduled` makes the audit entry and `lastSync` say so.
 */
export async function syncBookAs(
  deps: BookDeps,
  access: OfficerAccess,
  input: SyncInput,
  options: { scheduled?: boolean } = {}
) {
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

  const observedChanged = await mergeObservedInto(deps, input.corporationId, input.observed);

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
        ...(options.scheduled ? { scheduled: true } : {}),
        gaps: input.gaps,
      },
    });
    appendAudit(
      tx,
      deps,
      input.corporationId,
      actorOf(access, options.scheduled ? SCHEDULED_VIA : undefined),
      'sync',
      {
        observedChanged,
        extractions: input.extractions.length,
        donationsAdded,
        gaps: input.gaps.length,
      }
    );
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

/** The characters an officer unlinked: automatic grouping (D26) leaves them alone. */
const DECLINED_DOC = 'declinedAutoGroup';

/**
 * Checks a grouping against the other Miners and the guest rule, reading only.
 * `ignore` are Miners being dissolved in the same transaction.
 */
async function planMiner(
  c: EditCtx,
  miners: readonly QueryDocumentSnapshot[],
  action: { minerId: string; characterIds: number[]; mainCharacterId: number },
  ignore: ReadonlySet<string>
): Promise<{ pending: number[]; confirmed: Set<number> }> {
  const mine = miners.find((d) => d.id === action.minerId)?.data();
  if (mine?.closedAt != null)
    fail('failed-precondition', "This Miner's account is closed", 'account-closed');
  const clash = miners.find(
    (d) =>
      d.id !== action.minerId &&
      !ignore.has(d.id) &&
      (d.data().characterIds as number[]).some((x) => action.characterIds.includes(x))
  );
  if (clash)
    fail('failed-precondition', 'A character is already in another Miner', 'already-grouped');
  // Characters outside the corp are not linked until they confirm (D26b).
  const confirmed = new Set<number>((mine?.confirmedCharacterIds as number[] | undefined) ?? []);
  const outsiders = new Set<number>();
  for (const characterId of action.characterIds) {
    const rows = await c.tx.get(
      col(c, OBSERVED).where('characterId', '==', characterId).select('recordedCorporationId')
    );
    if (rows.docs.some((d) => d.get('recordedCorporationId') !== c.corporationId))
      outsiders.add(characterId);
  }
  return { pending: [...outsiders].filter((x) => !confirmed.has(x)), confirmed };
}

function writeMiner(
  c: EditCtx,
  action: { minerId: string; characterIds: number[]; mainCharacterId: number },
  { pending, confirmed }: { pending: number[]; confirmed: Set<number> }
): void {
  // An officer asking again starts a fresh question: the old answer no longer stands.
  clearAnswers(c, pending);
  c.tx.set(col(c, MINERS).doc(action.minerId), {
    id: action.minerId,
    characterIds: action.characterIds,
    mainCharacterId: action.mainCharacterId,
    pendingConfirmation: pending,
    confirmedCharacterIds: [...confirmed].filter((x) => action.characterIds.includes(x)),
    // A guest's character stays out of the readable grouping until it confirms (D26b).
    uids: action.characterIds.filter((x) => !pending.includes(x)).map((x) => `char:${x}`),
  });
}

/**
 * Takes a character out of a Miner grouping (or deletes the Miner when one character is left)
 * and records it in the book so no officer's sync puts it straight back (D26). False when the
 * character was not in the Miner; nothing is written then.
 */
function removeFromMiner(
  tx: Transaction,
  ref: DocumentReference,
  miner: Data,
  characterId: number
): boolean {
  const before = miner.characterIds as number[];
  const characterIds = before.filter((x) => x !== characterId);
  if (characterIds.length === before.length) return false;
  if (characterIds.length <= 1) {
    tx.delete(ref);
  } else {
    tx.update(ref, {
      characterIds,
      mainCharacterId: characterIds.includes(miner.mainCharacterId as number)
        ? miner.mainCharacterId
        : characterIds[0],
      pendingConfirmation: (miner.pendingConfirmation as number[]).filter((x) => x !== characterId),
      confirmedCharacterIds: (miner.confirmedCharacterIds as number[]).filter(
        (x) => x !== characterId
      ),
      uids: characterIds.map((x) => `char:${x}`),
    });
  }
  // D26: every officer's sync must leave this character out of an automatic group.
  tx.set(
    ref.parent.parent!.collection(META).doc(DECLINED_DOC),
    { ids: FieldValue.arrayUnion(characterId) },
    { merge: true }
  );
  return true;
}

/** What a character answered to a pending grouping, kept for the officers (D26b, #4210). */
const ANSWERS_DOC = 'groupingAnswers';

function recordAnswer(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  characterId: number,
  entry: { minerId: string; answer: 'confirmed' | 'declined'; via: 'character' | 'verify-link' }
): void {
  tx.set(
    sub(deps.db, corporationId, META).doc(ANSWERS_DOC),
    { answers: { [String(characterId)]: { ...entry, at: new Date(deps.now()).toISOString() } } },
    { merge: true }
  );
}

/** Drops what these characters last answered to a grouping question (D26b, #4210). */
function clearAnswers(c: EditCtx, characterIds: readonly number[]): void {
  if (characterIds.length === 0) return;
  c.tx.set(
    col(c, META).doc(ANSWERS_DOC),
    { answers: Object.fromEntries(characterIds.map((x) => [String(x), FieldValue.delete()])) },
    { merge: true }
  );
}

/** A character an officer put in a group on purpose is no longer one to keep out of auto-grouping. */
function keepInGroup(c: EditCtx, characterIds: readonly number[]): void {
  if (characterIds.length === 0) return;
  c.tx.set(
    col(c, META).doc(DECLINED_DOC),
    { ids: FieldValue.arrayRemove(...characterIds) },
    { merge: true }
  );
}

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
      // An omitted amount cannot dodge the gate: with a limit set it counts as over it.
      if (
        dismissalNeedsDirector(
          c.book.dismissApprovalAboveIsk as number | null | undefined,
          [action.amountIsk],
          c.access.isDirector
        )
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
    case 'dismissRecords': {
      // A day an active dismissal already covers is skipped, not dismissed twice. Days already on a
      // Statement are dismissed as the single `dismiss` does (the Statement is not touched).
      const wanted = new Map<string, number>();
      for (const t of action.targets) {
        wanted.set(t.targetId, (wanted.get(t.targetId) ?? 0) + t.amountIsk);
      }
      const already = new Set<string>();
      const wantedIds = [...wanted.keys()];
      for (let i = 0; i < wantedIds.length; i += 30) {
        const snap = await c.tx.get(
          col(c, DISMISSALS).where('targetId', 'in', wantedIds.slice(i, i + 30))
        );
        for (const d of snap.docs) {
          if (d.get('scope') === 'record' && !d.get('reversed')) already.add(d.get('targetId'));
        }
      }
      const targets = wantedIds
        .filter((id) => !already.has(id))
        .map((targetId) => ({ targetId, amountIsk: wanted.get(targetId) as number }));
      const skipped = wantedIds.filter((id) => already.has(id));
      if (targets.length === 0) {
        fail('failed-precondition', 'Those days are already dismissed', 'already-dismissed');
      }
      // The limit is on the total actually dismissed in this act, so splitting by day cannot dodge it (#4194).
      if (
        dismissalNeedsDirector(
          c.book.dismissApprovalAboveIsk as number | null | undefined,
          targets.map((t) => t.amountIsk),
          c.access.isDirector
        )
      ) {
        throw new HttpsError(
          'permission-denied',
          'A Director must approve this size of dismissal',
          { reason: 'director-approval' }
        );
      }
      const ids: string[] = [];
      targets.forEach((target, i) => {
        const id = `d${now}_${i}_${rand(4)}`;
        const characterId = Number(target.targetId.split(':')[0]);
        tx.create(col(c, DISMISSALS).doc(id), {
          id,
          scope: 'record',
          targetId: target.targetId,
          by,
          at: iso,
          reason: action.reason,
          uids: Number.isSafeInteger(characterId) ? [`char:${characterId}`] : [],
          amountIsk: target.amountIsk,
        });
        ids.push(id);
      });
      return {
        detail: {
          dismissalIds: ids,
          days: targets.length,
          skipped,
          totalIsk: targets.reduce((sum, t) => sum + t.amountIsk, 0),
          reason: action.reason,
        },
        result: { dismissalIds: ids, skipped },
      };
    }
    case 'reverseDismissal': {
      const ref = col(c, DISMISSALS).doc(action.dismissalId);
      const dismissal = await mustGet(c, ref, 'Dismissal');
      if (dismissal.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
      tx.update(ref, { reversed: { by, at: iso, reason: action.reason } });
      return { detail: { dismissalId: action.dismissalId, reason: action.reason } };
    }
    case 'linkSurvey': {
      const ref = col(c, EXTRACTIONS).doc(action.extractionId);
      await mustGet(c, ref, 'Extraction');
      // The sync's merge-set never writes this field, so a later sync keeps the link.
      tx.update(ref, { surveyId: action.surveyId ?? FieldValue.delete() });
      return { detail: { extractionId: action.extractionId, surveyId: action.surveyId } };
    }
    case 'setMiner': {
      const miners = await tx.get(col(c, MINERS));
      const out = await planMiner(c, miners.docs, action, new Set());
      writeMiner(c, action, out);
      keepInGroup(c, action.characterIds);
      return {
        detail: {
          minerId: action.minerId,
          characterIds: action.characterIds,
          pending: out.pending,
        },
        result: { pendingConfirmation: out.pending },
      };
    }
    case 'regroupMiner': {
      // One transaction for the whole fold: the absorbed groups are dissolved and the target set
      // together, so a failure leaves every character where it was (#4194).
      const miners = await tx.get(col(c, MINERS));
      const absorbed = new Set(action.absorbMinerIds);
      for (const id of absorbed) {
        const doc = miners.docs.find((d) => d.id === id);
        if (!doc) fail('not-found', 'Miner not found', 'not-found');
        const stray = (doc.data().characterIds as number[]).filter(
          (x) => !action.characterIds.includes(x)
        );
        if (stray.length > 0) {
          fail('invalid-argument', 'An absorbed Miner keeps a character out', 'regroup-incomplete');
        }
      }
      const out = await planMiner(c, miners.docs, action, absorbed);
      for (const id of absorbed) tx.delete(col(c, MINERS).doc(id));
      writeMiner(c, action, out);
      // A confirmation still stands for a character the Miner already held.
      clearAnswers(
        c,
        action.characterIds.filter((x) => !out.confirmed.has(x))
      );
      keepInGroup(c, action.characterIds);
      return {
        detail: {
          minerId: action.minerId,
          characterIds: action.characterIds,
          absorbed: action.absorbMinerIds,
          pending: out.pending,
        },
        result: { pendingConfirmation: out.pending },
      };
    }
    case 'unlink': {
      const ref = col(c, MINERS).doc(action.minerId);
      const miner = await mustGet(c, ref, 'Miner');
      if (!removeFromMiner(c.tx, ref, miner, action.characterId))
        fail('not-found', 'Not in that Miner', 'not-in-miner');
      // The grouping the answer was about is gone, so the answer must not outlive it.
      clearAnswers(c, [action.characterId]);
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
      const miner = await tx.get(col(c, MINERS).doc(statement.minerId));
      if (miner.exists && miner.get('closedAt') != null)
        fail('failed-precondition', "This Miner's account is closed", 'account-closed');
      const token = await issueStatementDoc(c, statement);
      return {
        detail: { statementId: statement.id, minerId: statement.minerId, amount: statement.amount },
        result: { statementId: statement.id, verifyToken: token },
      };
    }
    case 'closeAccount':
      return closeAccount(c, action);
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
    case 'recordMail': {
      // The queue sent this mail (D16): log it on the Statement and in the audit trail.
      const ref = col(c, STATEMENTS).doc(action.statementId);
      await mustGet(c, ref, 'Statement');
      tx.update(ref, { lastMailedAt: iso, mailsSent: FieldValue.increment(1) });
      return {
        detail: { statementId: action.statementId, mailId: action.mailId, kind: action.kind },
      };
    }
  }
}

/** Stores an issued Statement and its verify link; returns the link's token. Reads nothing: callers check first. */
async function issueStatementDoc(c: EditCtx, statement: StoredStatement): Promise<string> {
  const { tx, now } = c;
  const ref = col(c, STATEMENTS).doc(statement.id);
  if ((await tx.get(ref)).exists)
    fail('already-exists', 'An issued Statement never changes', 'statement-exists');
  const token = randomBytes(32).toString('base64url');
  tx.create(ref, {
    ...statement,
    uids: statement.characterIds.map((x) => `char:${x}`),
    remindersStopped: false,
    manualRemindersSent: 0,
    issuedBy: c.access.characterId,
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
  return token;
}

/**
 * Guest close-account (epic #4055, #4184): a final Statement, then the Miner
 * is closed so Statement mail stops. Credit is refunded unless the guest
 * consented or 90 days passed without a reply; a forfeit re-checks the role
 * live (`needsLiveCheck`). Members are not closed: a leaver's debt has its own
 * write-off.
 */
async function closeAccount(
  c: EditCtx,
  action: Extract<EditAction, { action: 'closeAccount' }>
): Promise<EditOutcome> {
  const { tx, now } = c;
  const iso = new Date(now).toISOString();
  const minerRef = col(c, MINERS).doc(action.minerId);
  const minerSnap = await tx.get(minerRef);
  if (minerSnap.exists && minerSnap.get('closedAt') != null)
    fail('failed-precondition', 'This account is already closed', 'already-closed');
  const characterIds = minerCharacters(action.minerId, minerSnap.data());
  if (characterIds.length === 0) fail('not-found', 'Miner not found', 'not-found');
  if (action.credit.kind === 'forfeit' && !forfeitAllowed(action.credit.basis, utcDate(now))) {
    fail(
      'failed-precondition',
      "Credit is forfeited only with the guest's consent or after 90 days with no reply",
      'forfeit-not-allowed'
    );
  }

  // A guest, by the ore's recorded corporation on each character's latest day.
  for (const characterId of characterIds) {
    const rows = await tx.get(
      col(c, OBSERVED)
        .where('characterId', '==', characterId)
        .select('recordedCorporationId', 'date')
    );
    const latest = rows.docs
      .map((d) => ({ date: d.get('date') as string, corp: d.get('recordedCorporationId') }))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest?.corp === c.corporationId)
      fail('failed-precondition', "Only a guest's account can be closed", 'not-a-guest');
  }

  const statement = action.statement ? parseStatement(action.statement) : undefined;
  if (statement && statement.minerId !== action.minerId)
    fail('invalid-argument', "Statement is another Miner's", 'wrong-miner');

  // The credit the guest is left with once the final Statement is counted.
  const [statements, payments, dismissals, extractions] = await Promise.all([
    tx.get(col(c, STATEMENTS).where('minerId', '==', action.minerId)),
    tx.get(col(c, PAYMENTS).where('minerId', '==', action.minerId)),
    tx.get(col(c, DISMISSALS)),
    tx.get(col(c, EXTRACTIONS)),
  ]);
  const held = statements.docs.map((d) => d.data() as Data);
  const allocation = allocatePayments({
    statements: [...held, ...(statement ? [statement] : [])].map((x) => ({
      id: x.id as string,
      amount: x.amount as number,
      issuedAt: x.issuedAt as string,
    })),
    payments: payments.docs.map((d) => paymentForAllocation(d.id, d.data())),
    dismissalCredits: dismissalCredits({
      minerId: action.minerId,
      statements: [...held, ...(statement ? [statement] : [])].map((x) => ({
        id: x.id as string,
        lines: (x.lines as DismissableLine[]) ?? [],
      })),
      dismissals: dismissals.docs.map((d) => d.data() as MirrorDismissal),
      extractions: extractions.docs.map((d) => d.data() as MirrorExtraction),
      expiryHours: (c.book.structureExpiryHours as Record<string, number> | undefined) ?? {},
    }),
    startDate: c.book.startDate as string | undefined,
  });
  const credit = Math.max(0, allocation.credit);
  const owed = [...allocation.byStatement.values()]
    .filter((s) => !s.settled)
    .reduce((sum, s) => sum + s.remaining, 0);

  let token: string | undefined;
  if (statement) token = await issueStatementDoc(c, statement);
  const closeFields = {
    closedAt: iso,
    closedBy: c.access.characterId,
    closeReason: action.reason,
    closeCredit: {
      amount: credit,
      disposition: action.credit.kind,
      ...(action.credit.kind === 'forfeit' ? { basis: action.credit.basis } : {}),
    },
    ...(statement ? { finalStatementId: statement.id } : {}),
  };
  if (minerSnap.exists) {
    tx.update(minerRef, closeFields);
  } else {
    // A solo guest has no Miner document until now; it keeps the guest's own-lines read (D26b).
    tx.set(minerRef, {
      id: action.minerId,
      characterIds,
      mainCharacterId: characterIds[0],
      pendingConfirmation: [],
      confirmedCharacterIds: [],
      uids: characterIds.map((x) => `char:${x}`),
      ...closeFields,
    });
  }
  return {
    detail: {
      minerId: action.minerId,
      reason: action.reason,
      ...(statement ? { statementId: statement.id, amount: statement.amount } : {}),
      credit,
      disposition: action.credit.kind,
      owed,
      ...(action.credit.kind === 'forfeit' ? { basis: action.credit.basis } : {}),
    },
    result: { credit, owed, ...(token ? { statementId: statement!.id, verifyToken: token } : {}) },
  };
}

function paymentForAllocation(id: string, p: Data) {
  return {
    id,
    amount: p.amount as number,
    at: p.at as string,
    ...(p.source === 'donation' || p.source === 'manual'
      ? { source: p.source as 'donation' | 'manual' }
      : {}),
    ...(typeof p.statementId === 'string' ? { statementId: p.statementId } : {}),
    ...(typeof p.notTaxAmount === 'number' ? { notTaxAmount: p.notTaxAmount } : {}),
  };
}

export async function editBook(deps: BookDeps, caller: Caller, call: BookCall, action: EditAction) {
  const access = await authorizeOfficer(deps, caller, call, 'edit', {
    live: needsLiveCheck(action),
  });
  return editBookAs(deps, access, call, action);
}

/** An edit once the caller is established; the scheduled sync passes `via` (ADR 0025). */
export async function editBookAs(
  deps: BookDeps,
  access: OfficerAccess,
  call: BookCall,
  action: EditAction,
  via?: string
) {
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
    appendAudit(tx, deps, call.corporationId, actorOf(access, via), action.action, outcome.detail);
    return outcome.result ?? {};
  });
}

/**
 * A guest or member confirms their own character into a Miner grouping (D26b). The only
 * proof accepted is the caller's own signed-in uid, which an EVE SSO sign-in with that
 * character minted (`verifyEveToken`): a verify token never confirms anything (#4210).
 */
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
    recordAnswer(tx, deps, corporationId, characterId, {
      minerId,
      answer: 'confirmed',
      via: 'character',
    });
    appendAudit(tx, deps, corporationId, { characterId, name: '' }, 'confirmGrouping', { minerId });
  });
}

/** Declines a pending grouping inside a transaction; shared by the two ways to decline. */
async function declinePending(
  deps: BookDeps,
  corporationId: number,
  minerId: string,
  characterId: number,
  actor: Actor
) {
  const ref = sub(deps.db, corporationId, MINERS).doc(minerId);
  await deps.db.runTransaction(async (tx) => {
    const miner = (await tx.get(ref)).data();
    if (!miner || !(miner.pendingConfirmation as number[]).includes(characterId)) {
      fail('not-found', 'Nothing to decline', 'nothing-pending');
    }
    // Removing the last other character deletes the Miner doc, which would erase `closedAt`.
    if (miner.closedAt != null)
      fail('failed-precondition', "This Miner's account is closed", 'account-closed');
    removeFromMiner(tx, ref, miner, characterId);
    recordAnswer(tx, deps, corporationId, characterId, {
      minerId,
      answer: 'declined',
      via: actor.via === 'verify-link' ? 'verify-link' : 'character',
    });
    appendAudit(tx, deps, corporationId, actor, 'declineGrouping', { minerId, characterId });
  });
}

/** The added character itself declines, signed in as itself. */
export async function declineGrouping(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  minerId: string
) {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  await declinePending(deps, corporationId, minerId, characterId, { characterId, name: '' });
}

/**
 * The Miner's verify link may decline a pending character but never confirm one. A decline
 * only removes a link, so the mail reaching the main is proof enough; a confirm grants the
 * grouping read access to the added character's lines, which only that character may allow.
 */
export async function declineGroupingByToken(deps: BookDeps, token: string, characterId: number) {
  const snap = await deps.db.collection(TOKENS_COLLECTION).doc(token).get();
  if (!snap.exists) fail('not-found', 'Verify link is not valid', 'invalid-token');
  const { corporationId, minerId } = snap.data() as { corporationId: number; minerId: string };
  await declinePending(deps, corporationId, minerId, characterId, {
    characterId: null,
    name: 'Miner (verify link)',
    via: 'verify-link',
  });
}

/**
 * The groupings waiting for the caller's character to confirm, across every corporation's
 * book. The caller learns only the corporation, the Miner and who the main is: enough to
 * recognise the request, nothing of the other characters or any lines.
 */
export async function listPendingGroupings(deps: BookDeps, caller: Caller) {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  const snap = await deps.db
    .collectionGroup(MINERS)
    .where('pendingConfirmation', 'array-contains', characterId)
    .get();
  const now = deps.now();
  const found = snap.docs.flatMap((d) => {
    const corporationId = Number(d.ref.parent.parent?.id);
    if (d.ref.parent.parent?.parent.id !== BOOKS_COLLECTION || !Number.isFinite(corporationId))
      return [];
    return [{ corporationId, minerId: d.id, mainCharacterId: d.get('mainCharacterId') as number }];
  });
  // A book still in its setup window is not shown to members yet, grouping questions included.
  const books = new Map(
    await Promise.all(
      [...new Set(found.map((f) => f.corporationId))].map(
        async (id) => [id, (await bookRef(deps.db, id).get()).get('membersSeeFrom')] as const
      )
    )
  );
  return found.filter((f) => {
    const seeFrom = books.get(f.corporationId);
    return typeof seeFrom !== 'number' || now >= seeFrom;
  });
}

/**
 * A player privately claims an Unmatched donation of their own (D5): the
 * callable has no officer role, only the caller's uid, which must be the
 * donor's. The ISK then credits the Miner the caller's character belongs to
 * (its confirmed grouping, or a Miner of its own), oldest Statement first.
 * Audited like every write; the audit entry names the donor character and
 * that the player did it, never anything else.
 */
export async function claimPayment(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  paymentId: string
) {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  const paymentRef = sub(deps.db, corporationId, PAYMENTS).doc(paymentId);
  return deps.db.runTransaction(async (tx) => {
    const book = await tx.get(bookRef(deps.db, corporationId));
    if (!book.exists || book.get('active') !== true)
      fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
    const snap = await tx.get(paymentRef);
    const payment = snap.data();
    // The same answer for a missing payment and someone else's: nothing leaks about other donors.
    if (!payment || payment.uid !== caller.uid) fail('not-found', 'Payment not found', 'not-found');
    if (payment.minerId !== undefined)
      fail('failed-precondition', 'Already assigned', 'already-assigned');
    if (((payment.notTaxAmount as number | undefined) ?? 0) >= (payment.amount as number))
      fail('failed-precondition', 'An officer marked this as not tax', 'not-tax');
    const grouped = await tx.get(
      sub(deps.db, corporationId, MINERS).where('characterIds', 'array-contains', characterId)
    );
    // A guest's character stays unlinked until they confirm (D26b): only a Miner that lists
    // this character in its readable `uids` counts.
    const miner = grouped.docs.find((d) => (d.get('uids') as string[]).includes(caller.uid));
    const minerId = miner ? miner.id : `solo:${characterId}`;
    tx.update(paymentRef, {
      minerId,
      claimedBy: characterId,
      claimedAt: new Date(deps.now()).toISOString(),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player claim', via: 'player-claim' },
      'claimPayment',
      { paymentId, minerId }
    );
    return { minerId };
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
  const [book, statements, payments, dismissals, extractions, paid, declarations, miner] =
    await Promise.all([
      bookRef(deps.db, corporationId).get(),
      sub(deps.db, corporationId, STATEMENTS).where('minerId', '==', minerId).get(),
      sub(deps.db, corporationId, PAYMENTS).where('minerId', '==', minerId).get(),
      sub(deps.db, corporationId, DISMISSALS).get(),
      sub(deps.db, corporationId, EXTRACTIONS).get(),
      sub(deps.db, corporationId, META).doc(PAID_DOC).get(),
      sub(deps.db, corporationId, DECLARATIONS).where('statementId', '==', statementId).get(),
      sub(deps.db, corporationId, MINERS).doc(minerId).get(),
    ]);
  const thisStatement = statements.docs.find((d) => d.id === statementId);
  if (!thisStatement) fail('not-found', 'Verify link is not valid', 'invalid-token');
  const s = thisStatement.data() as Data;
  // A whitelist: the guest sees no character ids (bar `pendingCharacterIds` below, which they must answer), officer ids or other bookkeeping.
  const shown: Data = {};
  for (const key of [
    'id',
    'code',
    'periodStart',
    'periodEnd',
    'coversFrom',
    'coversThrough',
    'issuedAt',
    'hubId',
    'oreForm',
    'amount',
    'corporationName',
    'minerName',
    'refineryNames',
  ]) {
    if (s[key] !== undefined) shown[key] = s[key];
  }
  shown.lines = ((s.lines as Data[] | undefined) ?? []).map((line) => {
    const { characterId: _c, ...rest } = line;
    void _c;
    return rest;
  });
  const b = book.data() ?? {};

  // The payments credited to THIS Statement: the Miner's whole allocation, then
  // the part of each payment that landed here (the miner's other Statements stay private).
  const allocation = allocatePayments({
    statements: statements.docs.map((d) => {
      const x = d.data();
      return { id: d.id, amount: x.amount as number, issuedAt: x.issuedAt as string };
    }),
    payments: payments.docs.map((d) => paymentForAllocation(d.id, d.data())),
    dismissalCredits: dismissalCredits({
      minerId,
      statements: statements.docs.map((d) => ({
        id: d.id,
        lines: (d.data().lines as DismissableLine[]) ?? [],
      })),
      dismissals: dismissals.docs.map((d) => d.data() as MirrorDismissal),
      extractions: extractions.docs.map((d) => d.data() as MirrorExtraction),
      expiryHours: (b.structureExpiryHours as Record<string, number> | undefined) ?? {},
    }),
    startDate: b.startDate as string | undefined,
  });
  const here = allocation.paymentCredits.filter((c) => c.statementId === statementId);
  const bySource = new Map(payments.docs.map((d) => [d.id, d.data()]));
  const settlement = allocation.byStatement.get(statementId);
  return {
    statement: shown,
    corporationId,
    terms: {
      hubId: s.hubId,
      oreForm: s.oreForm,
      startDate: b.startDate,
      overdueDays: b.overdueDays,
      minimumStatement: b.minimumStatement,
      divisions: b.divisions,
    },
    payments: here
      .map((c) => {
        const p = bySource.get(c.paymentId) ?? {};
        return {
          id: c.paymentId,
          amount: c.amount,
          at: p.at as string,
          source: p.source === 'manual' ? 'manual' : 'donation',
        };
      })
      .sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id)),
    settlement: settlement ?? null,
    declarations: declarations.docs.map((d) => {
      const x = d.data();
      return { kind: x.kind, at: x.at, resolution: x.resolution ?? null };
    }),
    settled: ((paid.data()?.ids as string[] | undefined) ?? []).includes(statementId),
    remindersStopped: s.remindersStopped === true,
    // A guest's closed account (epic): set by the `closeAccount` edit (#4184).
    accountClosed: miner.exists && miner.get('closedAt') != null,
    // Characters an officer added by hand that still wait for their own confirmation (#4210).
    pendingCharacterIds: miner.exists
      ? ((miner.get('pendingConfirmation') as number[] | undefined) ?? [])
      : [],
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
