// Corp Tax Book (issue #4061, ADR 0023): the admin-SDK half of the callables.
// Pure decisions, parsing and the layout are in corpTaxBook.ts. Every write to
// the book goes through here and appends to the immutable audit log in the
// same transaction; clients have no write path (firestore.rules). The caller's
// EVE access token is verified and used for ESI reads, then dropped: it is
// never written to Firestore or to the audit log.

import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { chunk } from './chunk.js';
import { absorbedMinerIds, loadRekeyRecords, planRekey } from './corpTaxBookRekey.js';
import {
  loadStampContext,
  restampStructures,
  stampBook,
  stampRows,
} from './corpTaxBookExtractionStamp.js';
import { backfillObservedUpdatedAt } from './corpTaxBookObservedBackfill.js';
import { cacheOfficer, readOfficerCache, revokeOfficer } from './officerCache.js';
import {
  ACCESS_TTL_MS,
  ADJUSTMENTS,
  AUDIT,
  BOOKS_COLLECTION,
  DECLARATIONS,
  DISMISSALS,
  DISPUTES,
  disputeIdFor,
  type ClaimCheck,
  type ClaimTransfer,
  checkClaimedTransfers,
  type DeclareOwnInput,
  type DisputeConflictInput,
  type DisputeKind,
  type WithdrawDisputeInput,
  EXTRACTIONS,
  FEEDER_INVITES_COLLECTION,
  BILLED_BY_COLLECTION,
  FEEDERS,
  FEEDER_OF_COLLECTION,
  FEEDER_PREVIOUS_COLLECTION,
  MEMBER_SETUP_MS,
  META,
  SCHEDULED_SYNC_DOC,
  MINERS,
  ACCOUNTS,
  OBSERVED,
  OFFICERS,
  PAID_DOC,
  UNCOUNTED_DOC,
  UNCOUNTED_IGNORED_MAX,
  PAYMENTS,
  REBILLS,
  STATEMENTS,
  STATEMENT_LINKS,
  TOKENS_COLLECTION,
  WRITE_OFFS,
  TOLERANCE_EXEMPTIONS,
  MINER_PAID,
  needsLiveCheck,
  dismissalNeedsDirector,
  defaultSettings,
  parseRecordKey,
  billedDisputeTax,
  disputesClosedByWriteOff,
  mergeDisputeLines,
  type RecordedOre,
  parseStatement,
  moveStartRate,
  sameDivisions,
  rateKey,
  startDateMoveReason,
  reanchorCadence,
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
  donationsReadAtPatch,
} from './corpTaxBook.js';
import {
  BOOK_DEFAULTS,
  extractionIdOf,
  allocatePayments,
  dismissalCredits,
  forfeitAllowed,
  canOverrideRecordRate,
  canRebillFrom,
  lastStatementDay,
  rateStartRefusal,
  latestRecordedCorp,
  creditedLines,
  disputeHolds,
  heldByStatement,
  readHoldingDisputes,
  mergeObservedRows,
  observedRowKey,
  shiftDate,
  writeOffForAllocation,
  type CorpRecord,
  type CoveragePeriod,
  type DismissableLine,
  type MirrorDismissal,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import {
  billsDays,
  type FeederExtraction,
  type StoredExtractionKey,
} from './corpTaxBookSyncEngine.js';
import { ledgerDays, ledgerPayments, liveAccount } from './corpTaxBookAccounts.js';
import type { IdentityReader } from './corpTaxBookEsi.js';
import { SRP_COLLECTIONS } from './srpTypes.js';
import { VETTING_COLLECTIONS } from './vettingTypes.js';
import { isMissingIndex } from './indexedSweep.js';
import { FEEDER_OBSERVED, rollupChanges, writeRollupChanges } from './corpTaxBookFeederRollup.js';
import { OBSERVED_UPDATED_AT_FIELD } from './corpTaxBookVersionKeys.js';
import { POP_SHARING_DOC, applyMoonOverride, popSharingFrom } from './popSharing.js';
import type { CorporationAllianceLookup } from './sharedPopsEsi.js';
import {
  EDITOR_CHECKED_AT,
  editorStampFields,
  refreshSharedPops,
  sharedPopsRepublish,
  sharedPopSourcesRef,
  sharedPopsRef,
  stampEditorUseIfSharing,
  stampFailedRoleCheck,
} from './sharedPopsStore.js';
import { editScope } from './corpTaxBookMinerTotals.js';
import { refreshAfterEvent } from './corpTaxBookMinerTotalsStore.js';
import { pullsOfDays, refreshMoonDocs } from './corpTaxBookMoonDocsStore.js';
import { refreshReadModels } from './corpTaxBookReadModelsStore.js';
import {
  fail,
  requireLiveRoles,
  signedInCharacter,
  verifyCallerToken,
  type Caller,
} from './actorAuth.js';
import type { AuditAction } from './corpTaxBookKinds.js';
import type { EveTokenClaims } from './verifyEveToken.js';

/** One type's parsed R2 open-prices object (`readOpenPricesFromR2`), or null when R2 has none. Throws on a failed read. */
export type OpenPricesReader = (typeId: number) => Promise<unknown | null>;

export interface BookDeps {
  db: Firestore;
  now: () => number;
  verifyToken: (accessToken: string) => Promise<EveTokenClaims>;
  readIdentity: IdentityReader;
  /** Prices the feeder view (issue #4512); absent in tests that never rebuild one. */
  openPrices?: OpenPricesReader;
  /** A corporation's CEO (public ESI); the removal (#4520) and payee (#4653) callables need it. */
  corporationCeo?: (corporationId: number) => Promise<number | undefined>;
  /** The book corporation's alliance (public ESI), for Shared Pops (#6223); absent keeps the last read. */
  corporationAlliance?: CorporationAllianceLookup;
}

type Data = Record<string, unknown>;

export const bookRef = (db: Firestore, corporationId: number) =>
  db.collection(BOOKS_COLLECTION).doc(String(corporationId));
/** `corps/{collector}/feeders/{feeder}`: one moon owner's record. */
export const feederRef = (db: Firestore, collector: number, feeder: number) =>
  bookRef(db, collector).collection(FEEDERS).doc(String(feeder));
const sub = (db: Firestore, corporationId: number, name: string) =>
  bookRef(db, corporationId).collection(name);

/** The book's officers whose access has not expired, once each: whom a moon owner's change is mailed to. */
export async function liveOfficerIds(
  deps: Pick<BookDeps, 'db' | 'now'>,
  corporationId: number
): Promise<number[]> {
  const now = deps.now();
  const officers = await sub(deps.db, corporationId, OFFICERS).get();
  const ids = officers.docs.flatMap((d) => {
    const id = d.get('characterId');
    const expires = d.get('expiresAt');
    return typeof id === 'number' && typeof expires === 'number' && expires > now ? [id] : [];
  });
  return [...new Set(ids)];
}

const rand = (bytes = 6) => randomBytes(bytes).toString('base64url');

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
  const characterId = signedInCharacter(caller);
  const now = deps.now();
  const officerRef = sub(deps.db, call.corporationId, OFFICERS).doc(caller.uid);
  const { held, usable } = await readOfficerCache(officerRef, caller, call.corporationId, now);

  let access: OfficerAccess;
  if (call.accessToken === undefined) {
    if (!usable) {
      fail(
        held ? 'failed-precondition' : 'permission-denied',
        'Verify as an officer first',
        held ? 'officer-check-stale' : 'not-an-officer'
      );
    }
    if (options.live)
      fail('failed-precondition', 'This needs a fresh role check', 'live-check-required');
    access = usable;
  } else {
    const actor = await verifyCallerToken(deps, caller, call.accessToken);
    const { claims } = actor;
    if (!options.live && usable) {
      access = usable;
    } else {
      const { identity, roles } = await requireLiveRoles(deps, actor, {
        corporationId: call.corporationId,
        need: 'canView',
        denied: { message: 'No officer role in this corporation', reason: 'not-an-officer' },
        // A failed renewal revokes the read access the old check granted, and the officer stops
        // counting for Community pop shares until their next editing use (#6223).
        onDenied: async () => {
          await stampFailedRoleCheck(deps.db, call.corporationId, characterId, now);
          await revokeOfficer(officerRef, held);
        },
      });
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
      if ((await bookRef(deps.db, call.corporationId).get()).exists)
        await cacheOfficer(officerRef, withEditorCheck(access, held));
    }
  }
  if (!satisfies(access, need)) {
    if (need !== 'view' && !access.canEdit)
      await stampFailedRoleCheck(deps.db, call.corporationId, characterId, now);
    throw new HttpsError('permission-denied', `This needs the ${need} role`, {
      reason: 'role-required',
      need,
    });
  }
  // The Community officer rule's clock (#6223): a use of the book with an editing role.
  // Read from the officer record already held (a live re-check carries its check time over), so
  // most calls read nothing more.
  if (access.canEdit)
    await stampEditorUseIfSharing(deps.db, call.corporationId, access, now, {
      ref: officerRef,
      held: held as Data | undefined,
    });
  return access;
}

/**
 * The record a live check writes, keeping the held record's `EDITOR_CHECKED_AT` while the same
 * pilot could still edit: a role regained after a refusal is looked at again at once.
 */
function withEditorCheck(access: OfficerAccess, held: OfficerAccess | undefined): OfficerAccess {
  const checkedAt = (held as Data | undefined)?.[EDITOR_CHECKED_AT];
  return held?.ownerHash === access.ownerHash && held.canEdit && typeof checkedAt === 'number'
    ? ({ ...access, [EDITOR_CHECKED_AT]: checkedAt } as OfficerAccess)
    : access;
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
  action: AuditAction,
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
  // A pointer a past delete missed (it failed, or a late sync) must not grant this book's reads.
  if (!(await ref.get()).exists) await deleteBilledByPointers(deps, input.corporationId);
  await deps.db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists)
      fail('already-exists', 'This corporation already has a Corp Tax Book', 'book-exists');
    // A corporation feeds another book or runs its own, never both (#4507).
    if (
      (await tx.get(deps.db.collection(FEEDER_OF_COLLECTION).doc(String(input.corporationId))))
        .exists
    )
      fail('failed-precondition', 'This corporation feeds another book', 'is-a-feeder');
    // A former moon owner's book starts no earlier than the leave day: the accounting
    // corporation covered every day before it, and an earlier start would bill them twice.
    const floor = await ownBookFloor((r) => tx.get(r), deps.db, input.corporationId);
    if (floor !== null && input.startDate < floor)
      fail('invalid-argument', 'The start date is before the leave day', 'start-before-leave');
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
 * The earliest own-book start of a corporation an accounting corporation handled before: the
 * day after its last coverage ended (a removal can take effect before it is processed), else
 * the UTC day it left (no closed coverage, or the book that held it is gone). Null if never.
 */
export async function ownBookFloor(
  get: (ref: DocumentReference) => Promise<DocumentSnapshot>,
  db: Firestore,
  corporationId: number
): Promise<string | null> {
  const previous = await get(db.collection(FEEDER_PREVIOUS_COLLECTION).doc(String(corporationId)));
  const leftAt = previous.get('leftAt');
  if (typeof leftAt !== 'number') return null;
  const collector = previous.get('collectorCorporationId');
  if (typeof collector === 'number') {
    const record = await get(feederRef(db, collector, corporationId));
    const periods = (record.get('coveragePeriods') ?? []) as CoveragePeriod[];
    const ends = periods.map((p) => p.to);
    if (ends.length > 0 && ends.every((to) => typeof to === 'string')) {
      return shiftDate((ends as string[]).sort().at(-1)!, 1);
    }
  }
  return utcDate(leftAt);
}

/** The `corps/{id}` subcollections that are not the book's: deleting the book leaves them. */
export const KEPT_ON_BOOK_DELETE: readonly string[] = [...SRP_COLLECTIONS, ...VETTING_COLLECTIONS];

/**
 * The book's half of `corps/{id}`: the document and every subcollection except SRP's and
 * vetting's, which share the document (#4939). Found at run time, so a book collection added
 * later still goes. Neither reads the parent document, and Firestore keeps a deleted
 * document's other subcollections.
 */
async function deleteBookContents(ref: DocumentReference): Promise<void> {
  for (const sub of await ref.listCollections()) {
    if (!KEPT_ON_BOOK_DELETE.includes(sub.id)) await ref.firestore.recursiveDelete(sub);
  }
  await ref.delete();
}

/**
 * Takes the book out of every Character's billed-by pointer (#4942), deleting a pointer it
 * leaves empty. Each pointer in its own transaction, so another book's sync merging into the
 * same pointer meanwhile keeps its entry.
 */
async function deleteBilledByPointers(deps: BookDeps, corporationId: number): Promise<void> {
  const key = String(corporationId);
  const field = new FieldPath('books', key);
  const pointers = await deps.db.collection(BILLED_BY_COLLECTION).where(field, '>=', 0).get();
  for (const part of chunk(pointers.docs, CHUNK)) {
    await Promise.all(
      part.map((pointer) =>
        deps.db.runTransaction(async (tx) => {
          const books = (await tx.get(pointer.ref)).get('books') as
            Record<string, unknown> | undefined;
          if (!books || !(key in books)) return;
          if (Object.keys(books).length === 1) tx.delete(pointer.ref);
          else tx.update(pointer.ref, field, FieldValue.delete());
        })
      )
    );
  }
}

/**
 * The player who turned the book on (or the CEO) deletes it outright: the book,
 * everything under it, its Statement verify links and billed-by pointers. The
 * corporation's SRP data under the same `corps/{id}` document stays. `beforeDelete` lets the
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
  await deleteBookContents(ref);
  // A scheduled sync that loaded its grant before it was dropped may still have been writing.
  await deleteBookContents(ref);
  // Its published Shared Pops and their inputs go with it (#6223).
  await Promise.all([
    sharedPopsRef(deps.db, call.corporationId).delete(),
    sharedPopSourcesRef(deps.db, call.corporationId).delete(),
  ]);
  // Last, so a late sync has the narrowest window to write one back (can't close it).
  await deleteBilledByPointers(deps, call.corporationId);
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
/** The Extraction fields that decide which days its window covers. */
const WINDOW_FIELDS = ['chunkArrivalTime', 'naturalDecayTime', 'laserFiredAt', 'cancelledAt'];
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
  incoming: readonly ObservedRow[],
  /** Extractions the same sync is about to write, so a row placed by them is stamped now. */
  extractions: readonly MirrorExtraction[] = [],
  /** Collects the pulls whose rows changed; a caller that passes it refreshes their moon docs itself. */
  touched?: Set<string>
): Promise<number> {
  // Each row carries the Extraction covering its day (ADR 0032): a merge replaces the whole row, so it must stamp.
  const rows = stampRows(incoming, await loadStampContext(deps.db, corporationId, extractions));
  let observedChanged = 0;
  const pulls = touched ?? new Set<string>();
  for (const part of chunk(rows, CHUNK)) {
    const col = sub(deps.db, corporationId, OBSERVED);
    observedChanged += await deps.db.runTransaction(async (tx) => {
      const unique = [...new Map(part.map((r) => [obsId(r), r])).values()];
      const refs = unique.map((r) => col.doc(obsId(r)));
      const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
      const existing = snaps.filter((s) => s.exists).map((s) => s.data() as ObservedRow);
      const { changed } = mergeObservedRows(existing, part);
      const last = new Map(changed.map((r) => [observedRowKey(r), r]));
      for (const r of last.values()) if (r.extractionId !== undefined) pulls.add(r.extractionId);
      for (const row of last.values()) {
        // `updatedAt` is what an officer's client reads a delta by (bookDeltaCache.ts):
        // `cachedAt` is the ESI response's time, not this write's.
        tx.set(col.doc(obsId(row)), {
          ...row,
          uid: `char:${row.characterId}`,
          [OBSERVED_UPDATED_AT_FIELD]: FieldValue.serverTimestamp(),
        });
      }
      // The feeder mirror moves with the rows (corpTaxBookFeederRollup.ts).
      writeRollupChanges(
        tx,
        sub(deps.db, corporationId, FEEDER_OBSERVED),
        rollupChanges([...last.values()], new Map(existing.map((r) => [observedRowKey(r), r])))
      );
      return last.size;
    });
  }
  await writeBilledByPointers(deps, corporationId, rows);
  if (touched === undefined) await refreshMoonDocs(deps.db, corporationId, pulls);
  return observedChanged;
}

/**
 * Points each Character the book observed at the book (`corpTaxBookBilledBy`), so
 * the miner's client finds it whatever corporation they are in now. Refreshed on
 * every sync; a failure never fails the sync, the next one writes it again.
 */
export async function writeBilledByPointers(
  deps: BookDeps,
  corporationId: number,
  rows: readonly ObservedRow[]
): Promise<void> {
  const characterIds = [...new Set(rows.map((r) => r.characterId))];
  const at = Date.now();
  for (const part of chunk(characterIds, CHUNK)) {
    const batch = deps.db.batch();
    for (const characterId of part) {
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
 * Merge Extractions into a book (an officer's Survey link or Fully Mined flag stays) and re-stamp
 * the rows their windows now cover. Adds each new or changed one to `touched`; one that says what
 * the book already holds is not written again.
 */
async function writeExtractions(
  deps: BookDeps,
  corporationId: number,
  incoming: readonly MirrorExtraction[],
  touched: Set<string>
): Promise<void> {
  const extractions = sub(deps.db, corporationId, EXTRACTIONS);
  const corrected = new Set<number>();
  for (const x of incoming) {
    const id = extractionIdOf(x);
    const fields: Data = { ...x, id };
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
    const held = (await extractions.doc(id).get()).data();
    if (!held || WINDOW_FIELDS.some((f) => fields[f] !== undefined && fields[f] !== held[f]))
      corrected.add(x.structureId);
    // A new Extraction, or one whose make-up or dates moved, changes its moon doc (ADR 0032).
    if (
      held &&
      Object.keys(fields).every((k) => JSON.stringify(fields[k]) === JSON.stringify(held[k]))
    )
      continue;
    touched.add(id);
    await extractions.doc(id).set(fields, { merge: true });
  }
  // A new or corrected Extraction moves which rows its window covers (ADR 0032). Best effort.
  await restampStructures(deps.db, corporationId, [...corrected]).catch((e) =>
    console.error('extraction restamp failed', e instanceof Error ? e.message : e)
  );
}

/**
 * A moon owner's chunk that has not arrived and that ESI no longer lists was cancelled: the
 * notification that says so is read only by a grant with the notifications scope, and may be gone. Returns the ids marked.
 */
async function cancelUnlistedFeederExtractions(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number,
  listed: readonly MirrorExtraction[]
): Promise<string[]> {
  const now = new Date(deps.now()).toISOString();
  const keep = new Set(listed.map(extractionIdOf));
  const stored = await sub(deps.db, collectorCorporationId, EXTRACTIONS)
    .where('sourceCorporationId', '==', feederCorporationId)
    .get();
  const gone = stored.docs.filter((d) => {
    const x = d.data() as MirrorExtraction;
    return !x.cancelledAt && x.chunkArrivalTime > now && !keep.has(d.id);
  });
  for (const d of gone) await d.ref.update({ cancelledAt: now });
  return gone.map((d) => d.id);
}

/** The key fields of a moon owner's stored Extractions: a notification keeps each one's own start. */
export async function storedFeederExtractionKeys(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number
): Promise<StoredExtractionKey[]> {
  const stored = await sub(deps.db, collectorCorporationId, EXTRACTIONS)
    .where('sourceCorporationId', '==', feederCorporationId)
    .get();
  return stored.docs.map((d) => d.data() as StoredExtractionKey);
}

/**
 * A moon owner's Extractions into the Collector's book (#6097), each tagged with the moon
 * owner's corporation id. Like a feeder's rows, they never touch the book's `lastSync`, gaps or
 * audit. `complete` says ESI's list was whole, so a coming chunk missing from it is cancelled.
 */
export async function storeFeederExtractions(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number,
  extractions: readonly FeederExtraction[],
  complete: boolean
): Promise<void> {
  const touched = new Set<string>();
  await writeExtractions(deps, collectorCorporationId, extractions, touched);
  if (complete) {
    const cancelled = await cancelUnlistedFeederExtractions(
      deps,
      collectorCorporationId,
      feederCorporationId,
      extractions
    );
    for (const id of cancelled) touched.add(id);
  }
  if (touched.size === 0) return;
  await refreshMoonDocs(deps.db, collectorCorporationId, touched);
  // The Overview and Extractions tabs read Extractions from the tab docs (ADR 0032).
  await refreshReadModels(deps.db, collectorCorporationId, deps.now());
  // A moon owner's new or cancelled chunk is a Shared Pop too (#6223). Best effort.
  await refreshSharedPops(deps, collectorCorporationId);
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
  const held = await book.get();
  if (!held.exists) fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  if (input.extractions.length > 0 && !access.isStationManager) {
    fail(
      'permission-denied',
      'Extractions need the Station_Manager role',
      'station-manager-required'
    );
  }

  const touchedPulls = new Set<string>();
  const observedChanged = await mergeObservedInto(
    deps,
    input.corporationId,
    input.observed,
    input.extractions,
    touchedPulls
  );
  // Old rows carry no `updatedAt`, which a client's delta read needs (#5243). Best effort.
  await backfillObservedUpdatedAt(deps.db, input.corporationId, deps.now).catch((e) =>
    console.error('observed backfill failed', e instanceof Error ? e.message : e)
  );

  await writeExtractions(deps, input.corporationId, input.extractions, touchedPulls);
  await stampBook(deps.db, input.corporationId, deps.now).catch((e) =>
    console.error('extraction stamp backfill failed', e instanceof Error ? e.message : e)
  );

  const payments = sub(deps.db, input.corporationId, PAYMENTS);
  let donationsAdded = 0;
  /** Miners a new donation was matched to: their totals move (ADR 0032). */
  const paidMiners = new Set<string>();
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
      ...(dn.reviewReason !== undefined ? { reviewReason: dn.reviewReason } : {}),
    };
    try {
      // create(): a re-synced donation never overwrites an officer's "not tax" mark.
      await payments.doc(id).create(data);
      donationsAdded += 1;
      if (dn.minerId !== undefined) paidMiners.add(dn.minerId);
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err;
    }
  }

  // A scheduled run that changed nothing (no row, Extraction or donation, the same gaps) is the
  // common case every two hours: it still stamps `lastSync` (the health strip's "last synced",
  // and the next run's gap detection), but adds no audit entry and republishes no Shared Pops.
  const quiet =
    options.scheduled === true &&
    observedChanged === 0 &&
    touchedPulls.size === 0 &&
    donationsAdded === 0 &&
    isDeepStrictEqual(
      input.gaps,
      (held.get('lastSync') as { gaps?: unknown } | undefined)?.gaps ?? []
    );
  const now = deps.now();
  await deps.db.runTransaction(async (tx) => {
    // Read in the transaction, so a concurrent sync that read the wallet is never nulled.
    const readAt = input.donationsRead === false ? (await tx.get(book)).get('donationsReadAt') : 0;
    tx.update(book, {
      ...donationsReadAtPatch(input.donationsRead, readAt, now),
      lastSync: {
        at: now,
        byCharacterId: access.characterId,
        byName: access.characterName,
        ...(options.scheduled ? { scheduled: true } : {}),
        gaps: input.gaps,
      },
    });
    if (quiet) return;
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
  // A note for officers, not the sync's own writes: best effort, the next sync writes it again.
  if (input.uncounted !== undefined)
    await storeUncounted(deps, input.corporationId, input.uncounted).catch((e) =>
      console.error('uncounted donations write failed', e instanceof Error ? e.message : e)
    );
  if (paidMiners.size > 0)
    await refreshAfterEvent(deps.db, input.corporationId, [...paidMiners], deps.now);
  // Rows or a chunk make-up moved these pulls (ADR 0032). Best effort, like the totals above.
  await refreshMoonDocs(deps.db, input.corporationId, touchedPulls);
  // Only donations and Extractions are in the Overview and Miners tab docs (ADR 0032); rows are not. Best effort.
  // A quiet run wrote none of either: the docs stand.
  if (!quiet && (donationsAdded > 0 || input.extractions.length > 0))
    await refreshReadModels(deps.db, input.corporationId, deps.now());
  // A sync that changed something republishes the book's Shared Pops (#6223). Best effort. A
  // quiet one has nothing new to publish (a viewer's read drops an expired pop by itself), except
  // what the publish learns on its own clock: the alliance, and refinery names the scheduled run
  // learned. So it republishes a doc that old, or one whose alliance the corporation has left.
  const republish = await sharedPopsRepublish(deps, input.corporationId, !quiet);
  if (republish) await refreshSharedPops(deps, input.corporationId, republish);
  return { observedChanged, extractions: input.extractions.length, donationsAdded };
}

/**
 * #6207: replaces the noted donations into divisions the book does not read, leaving out the
 * ones an officer already called not tax. Officers-only (`meta`): it names donors and amounts.
 */
async function storeUncounted(
  deps: BookDeps,
  corporationId: number,
  uncounted: NonNullable<SyncInput['uncounted']>
) {
  const ref = sub(deps.db, corporationId, META).doc(UNCOUNTED_DOC);
  await deps.db.runTransaction(async (tx) => {
    const held = (await tx.get(ref)).data();
    const ignored = new Set((held?.ignored as string[] | undefined) ?? []);
    const donations = uncounted.filter((u) => !ignored.has(u.id));
    // Unchanged writes nothing: every write to `meta` moves its version stamp, which makes
    // officers' devices read the doc again (#5047).
    if (isDeepStrictEqual(donations, held?.donations ?? [])) return;
    tx.set(ref, { donations }, { merge: true });
  });
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
  /** Several audit entries for one write (each with its own action); replaces `detail`'s entry. */
  audits?: { action: AuditAction; detail: Data }[];
  result?: Data;
}

/** A dispute doc that still names ore; a withdrawn day's tombstone has none. */
const hasLines = (d: Data) => Array.isArray(d.lines) && d.lines.length > 0;

const col = (c: EditCtx, name: string) => sub(c.deps.db, c.corporationId, name);

/**
 * The ids, among `statements`, that open disputes hold something of at `now`
 * (`heldByStatement`, priced and credited as the allocation reads them).
 */
async function heldStatementIds(c: EditCtx, statements: readonly Data[], now: string) {
  const held = new Set<string>();
  for (const minerId of new Set(statements.map((s) => s.minerId as string))) {
    const disputes = readHoldingDisputes(
      (await c.tx.get(col(c, DISPUTES).where('minerId', '==', minerId))).docs.map((d) => d.data())
    ).filter((d) => disputeHolds(d, now));
    if (disputes.length === 0) continue;
    const [all, dismissals, extractions] = await Promise.all([
      c.tx.get(col(c, STATEMENTS).where('minerId', '==', minerId)),
      c.tx.get(col(c, DISMISSALS)),
      c.tx.get(col(c, EXTRACTIONS)),
    ]);
    const ofMiner = all.docs.map((d) => d.data() as Data);
    const byId = new Map(ofMiner.map((s) => [s.id as string, s]));
    for (const s of statements) if (s.minerId === minerId) byId.set(s.id as string, s);
    const mine = [...byId.values()].map((x) => ({
      id: x.id as string,
      lines: (x.lines as DismissableLine[]) ?? [],
    }));
    const credits = dismissalCredits({
      minerId,
      statements: mine,
      dismissals: dismissals.docs.map((d) => d.data() as MirrorDismissal),
      extractions: extractions.docs.map((d) => d.data() as MirrorExtraction),
      expiryHours: (c.book.structureExpiryHours as Record<string, number> | undefined) ?? {},
    });
    const amounts = heldByStatement(mine, disputes, creditedLines(credits), now);
    for (const [id, amount] of amounts) if (amount > 0) held.add(id);
  }
  return held;
}

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

/** The sign-ins that read a Miner's own lines (`uids`): read in the transaction, before any write. */
/** The Director gate dismissals use (D6), for an act that undoes or reprices money of these sizes. */
function requireDirectorAbove(c: EditCtx, amounts: readonly number[]): void {
  // A change of nothing (a new date or label only) moves no money: the gate counts size, and the
  // dismissal helper reads a zero as "unknown, so over the limit".
  const sized = amounts.filter((a) => a > 0);
  if (sized.length === 0) return;
  if (
    dismissalNeedsDirector(
      c.book.dismissApprovalAboveIsk as number | null | undefined,
      sized,
      c.access.isDirector
    )
  ) {
    throw new HttpsError('permission-denied', 'A Director must approve this size of change', {
      reason: 'director-approval',
    });
  }
}

/**
 * A correction can be undone only while no issued Statement has billed it (D22: a Statement is
 * frozen): after that the officer adds an opposite correction.
 */
async function assertAdjustmentReversible(
  c: EditCtx,
  adjustmentId: string,
  adjustment: Record<string, unknown>
): Promise<void> {
  if (adjustment.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
  const billed = (
    await c.tx.get(col(c, STATEMENTS).where('minerId', '==', adjustment.minerId))
  ).docs.some((d) =>
    ((d.data().lines as { adjustmentId?: string }[] | undefined) ?? []).some(
      (l) => l.adjustmentId === adjustmentId
    )
  );
  if (billed)
    fail(
      'failed-precondition',
      'A Statement already billed this correction: add an opposite correction instead',
      'billed-on-statement'
    );
}

async function minerUids(c: EditCtx, minerId: string): Promise<string[]> {
  const miner = (await c.tx.get(col(c, MINERS).doc(minerId))).data();
  return minerCharacters(minerId, miner).map((id) => `char:${id}`);
}

/**
 * Confirms the Declaration a payment is for, in the payment's own transaction: it must be this
 * Miner's and not yet answered. Its resolution is the single point both ways of confirming it go
 * through (a hand-recorded payment, or a matched donation), so whichever lands first wins and the
 * other is refused, never counting the ISK twice. Call it after the caller's own reads.
 */
async function confirmDeclaration(
  c: EditCtx,
  declarationId: string | undefined,
  minerId: string,
  paymentId: string
): Promise<void> {
  if (declarationId === undefined) return;
  const ref = col(c, DECLARATIONS).doc(declarationId);
  const declaration = await mustGet(c, ref, 'Declaration');
  if (declaration.resolution) fail('failed-precondition', 'Already resolved', 'already-resolved');
  if (declaration.minerId !== undefined && declaration.minerId !== minerId)
    fail('invalid-argument', "Declaration is another Miner's", 'wrong-miner');
  c.tx.update(ref, {
    resolution: {
      kind: 'confirmed',
      at: new Date(c.now).toISOString(),
      by: c.access.characterId,
      paymentId,
    },
  });
}

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
    if (await recordedOutside(c, characterId)) outsiders.add(characterId);
  }
  return { pending: [...outsiders].filter((x) => !confirmed.has(x)), confirmed };
}

/**
 * Existence checks on a character's observed rows. Each asks Firestore for one row instead of
 * reading all of them; a query whose composite index is not deployed yet (see
 * firestore.indexes.json) reads the character's rows as it always did.
 */
async function recordedOutside(c: EditCtx, characterId: number): Promise<boolean> {
  const rows = col(c, OBSERVED).where('characterId', '==', characterId);
  try {
    // `!=` skips a row with no recordedCorporationId; the sync always writes one.
    const hit = await c.tx.get(rows.where('recordedCorporationId', '!=', c.corporationId).limit(1));
    return !hit.empty;
  } catch (e) {
    if (!isMissingIndex(e)) throw e;
    const all = await c.tx.get(rows.select('recordedCorporationId'));
    return all.docs.some((d) => d.get('recordedCorporationId') !== c.corporationId);
  }
}

async function recordedHereSince(
  c: EditCtx,
  characterId: number,
  fromDate: string
): Promise<boolean> {
  const rows = col(c, OBSERVED).where('characterId', '==', characterId);
  try {
    const hit = await c.tx.get(
      rows
        .where('recordedCorporationId', '==', c.corporationId)
        .where('date', '>=', fromDate)
        .limit(1)
    );
    return !hit.empty;
  } catch (e) {
    if (!isMissingIndex(e)) throw e;
    const all = await c.tx.get(rows.select('recordedCorporationId', 'date'));
    return all.docs.some(
      (d) => d.get('date') >= fromDate && d.get('recordedCorporationId') === c.corporationId
    );
  }
}

/**
 * The corporation the character was last recorded in, by the engine's rule
 * (`latestRecordedCorp`: newest day, freshest read, then refinery and corporation id), so the
 * Close account guard agrees with the guest the officer's view shows. Every row of the newest
 * day is read: a character can change corporation mid-day.
 */
async function latestRecordedCorpOf(c: EditCtx, characterId: number): Promise<number | undefined> {
  const rows = col(c, OBSERVED).where('characterId', '==', characterId);
  const fields = ['characterId', 'recordedCorporationId', 'date', 'cachedAt', 'structureId'];
  let days: QueryDocumentSnapshot[];
  try {
    const top = await c.tx.get(rows.orderBy('date', 'desc').limit(1));
    if (top.empty) return undefined;
    days = (await c.tx.get(rows.where('date', '==', top.docs[0].get('date')))).docs;
  } catch (e) {
    if (!isMissingIndex(e)) throw e;
    days = (await c.tx.get(rows.select(...fields))).docs;
  }
  return latestRecordedCorp(days.map((d) => d.data() as CorpRecord)).get(characterId)?.corp;
}

/**
 * Grouping moves what the absorbed Miners were billed, paid and disputed onto the surviving id
 * (#6450), so the Miners table lists one row. Every read happens here, before the caller's
 * first write; the returned function stages the writes.
 */
async function rekeyAbsorbed(
  tx: Transaction,
  db: Firestore,
  corporationId: number,
  target: string,
  targetUids: readonly string[],
  absorbed: readonly string[]
): Promise<() => void> {
  if (absorbed.length === 0) return () => undefined;
  const at = (name: string) => sub(db, corporationId, name);
  const { records, existingDisputeIds } = await loadRekeyRecords(
    {
      read: async (collection, field, ids, also) => {
        let q = at(collection).where(field, 'in', ids);
        if (also) q = q.where(also[0], '==', also[1]);
        return (await tx.get(q)).docs.map((d) => ({ collection, id: d.id, data: d.data() }));
      },
      exists: async (collection, id) => (await tx.get(at(collection).doc(id))).exists,
    },
    target,
    absorbed
  );
  const writes = planRekey({ target, targetUids, records, existingDisputeIds });
  // A transaction holds 500 writes; a move is two. Refuse, rather than fail half-way.
  if (writes.length > 450)
    fail('failed-precondition', 'Too many records to move in one grouping', 'regroup-too-large');
  return () => {
    for (const w of writes) {
      if (w.kind === 'update') tx.update(at(w.collection).doc(w.id), w.fields);
      else if (w.kind === 'delete') tx.delete(at(w.collection).doc(w.id));
      else {
        tx.set(at(w.collection).doc(w.toId), w.data);
        tx.delete(at(w.collection).doc(w.fromId));
      }
    }
  };
}

/** What a grouping folds in and who can read it: a guest's character still waiting to confirm (D26b) stays out. */
function rekeyScope(
  action: { minerId: string; characterIds: number[] },
  absorbMinerIds: readonly string[],
  pending: readonly number[]
) {
  const joined = action.characterIds.filter((x) => !pending.includes(x));
  return {
    absorbed: absorbedMinerIds(action.minerId, joined, absorbMinerIds),
    uids: joined.map((x) => `char:${x}`),
  };
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

const ACCOUNT_FIGURES = ['owed', 'paid', 'days', 'oldest', 'paidThrough'] as const;

/** Whether a stored account already holds these figures (its `at` and `by` aside). */
function sameAccount(
  stored: FirebaseFirestore.DocumentData | undefined,
  next: Record<string, unknown>
): boolean {
  return (
    !!stored &&
    ACCOUNT_FIGURES.every((k) => stored[k] === next[k]) &&
    JSON.stringify(stored.unpaidDays ?? null) === JSON.stringify(next.unpaidDays ?? null)
  );
}

/**
 * The paid-through days `recordAccounts` may store (D22): per Miner the day the client asked for,
 * never before the stored one, never today or later (its ore is still coming in), never on or
 * past a day an open dispute holds (the hold may end with the officer keeping the bill). A day
 * that fails is skipped, not an error: the next run asks again. The server has no prices, so the
 * saved-price rule is the client's (`closableThrough`).
 */
async function storableSettledThrough(
  c: EditCtx,
  accounts: readonly { minerId: string; settledThrough?: string }[],
  paidRef: DocumentReference,
  iso: string
): Promise<Record<string, string>> {
  const asked = accounts.filter((a) => a.settledThrough !== undefined);
  if (asked.length === 0) return {};
  const stored = ((await c.tx.get(paidRef)).data()?.minerPaidThrough ?? {}) as Record<
    string,
    string
  >;
  const today = iso.slice(0, 10);
  const candidates = asked.filter(
    (a) =>
      a.settledThrough !== undefined &&
      a.settledThrough < today &&
      a.settledThrough > (stored[a.minerId] ?? '')
  );
  // The earliest day an open dispute holds, per Miner; read once for every Miner asked about.
  const heldFrom = new Map<string, string>();
  for (const ids of chunk(
    candidates.map((a) => a.minerId),
    30
  )) {
    for (const doc of (await c.tx.get(col(c, DISPUTES).where('minerId', 'in', ids))).docs) {
      const d = doc.data();
      if (!readHoldingDisputes([d]).some((h) => disputeHolds(h, iso))) continue;
      const held = d.date as string; // a dispute with no date reads as no hold
      if (held < (heldFrom.get(d.minerId) ?? '9999')) heldFrom.set(d.minerId, held);
    }
  }
  const out: Record<string, string> = {};
  for (const { minerId, settledThrough: day } of candidates)
    if (day !== undefined && day < (heldFrom.get(minerId) ?? '9999')) out[minerId] = day;
  return out;
}

/**
 * A new rate may start up to 30 days back but never on a day an issued Statement bills: that
 * Statement never changes. Statements are read only when a rate is backdated.
 */
async function checkRateStarts(c: EditCtx, newRates: readonly { effectiveFrom: string }[]) {
  const today = utcDate(c.now);
  if (!newRates.some((r) => r.effectiveFrom < today)) return;
  const statements = await c.tx.get(col(c, STATEMENTS));
  const last = lastStatementDay(statements.docs.map((d) => d.data() as never));
  for (const r of newRates) {
    const why = rateStartRefusal(r.effectiveFrom, today, last);
    if (why === 'too-old')
      fail('failed-precondition', 'A rate cannot start more than 30 days back', 'rate-too-old');
    if (why === 'on-statement')
      fail('failed-precondition', 'That day is already on a Statement', 'day-on-statement');
  }
}

async function applyEdit(c: EditCtx, action: EditAction): Promise<EditOutcome> {
  const { tx, now } = c;
  const iso = new Date(now).toISOString();
  const by = c.access.characterId;
  const bookDoc = bookRef(c.deps.db, c.corporationId);
  const rates = (c.book.rates as StoredRate[] | undefined) ?? [];

  switch (action.action) {
    case 'addRate': {
      await checkRateStarts(c, [action.rate]);
      const next = [...rates.filter((r) => rateKey(r) !== rateKey(action.rate)), action.rate];
      if (next.length > 500) fail('resource-exhausted', 'Too many rates', 'too-many-rates');
      tx.update(bookDoc, { rates: next });
      return { detail: { rate: action.rate } };
    }
    case 'addRates': {
      await checkRateStarts(c, action.rates);
      const keys = new Set(action.rates.map(rateKey));
      if (keys.size !== action.rates.length)
        fail('invalid-argument', 'Two of the rates are the same', 'duplicate-rate');
      const next = [...rates.filter((r) => !keys.has(rateKey(r))), ...action.rates];
      if (next.length > 500) fail('resource-exhausted', 'Too many rates', 'too-many-rates');
      tx.update(bookDoc, { rates: next });
      return {
        detail: {},
        audits: action.rates.map((rate) => ({ action: 'addRate', detail: { rate } })),
      };
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
      const {
        structureExpiryHours,
        dismissApprovalAboveIsk,
        showToMembers,
        startDate,
        divisions,
        divisionsBase,
        addDivision,
        taxContact,
        switchToRunningAccount,
        ...rest
      } = action.patch;
      if (
        (startDate !== undefined || showToMembers || switchToRunningAccount) &&
        !c.access.isDirector
      ) {
        throw new HttpsError('permission-denied', 'Only a Director sets this', {
          reason: 'director-only',
        });
      }
      const update: Data = { ...rest };
      // A book stored without divisions reads division 1, as the client and the sync read it.
      const storedDivisions = Array.isArray(c.book.divisions)
        ? (c.book.divisions as number[])
        : [...BOOK_DEFAULTS.divisions];
      if (addDivision !== undefined) {
        // Added to what is stored now, so a concurrent addition by another officer is kept.
        if (!storedDivisions.includes(addDivision)) {
          update.divisions = [...storedDivisions, addDivision].sort((a, b) => a - b);
        }
        // Its names were read for the client's own (maybe stale) list: merged, they never drop
        // the name of a division another officer counted meanwhile.
        if (rest.divisionNames) {
          update.divisionNames = {
            ...(c.book.divisionNames as Data | undefined),
            ...rest.divisionNames,
          };
        }
      } else if (divisions) {
        if (divisionsBase && !sameDivisions(divisionsBase, storedDivisions)) {
          fail(
            'failed-precondition',
            'The divisions changed since you opened the settings',
            'divisions-changed'
          );
        }
        update.divisions = divisions;
      }
      // Any officer who can edit sets it (not a Director-only setting); null deletes the field.
      if (taxContact !== undefined) {
        update.taxContact = taxContact === null ? FieldValue.delete() : taxContact;
      }
      if (showToMembers) update.membersSeeFrom = now;
      // Once, and never back: Statements issued before it keep their own rules.
      if (switchToRunningAccount && typeof c.book.runningAccountFrom !== 'string') {
        update.runningAccountFrom = iso;
      }
      const oldStart = c.book.startDate as string | undefined;
      if (startDate !== undefined && startDate !== oldStart) {
        const statements = await tx.get(col(c, STATEMENTS));
        const reason = startDateMoveReason(
          oldStart ?? startDate,
          startDate,
          utcDate(now),
          await ownBookFloor((r) => tx.get(r), c.deps.db, c.corporationId),
          statements.docs.map((d) => d.data() as never)
        );
        if (reason) fail('failed-precondition', 'The start date cannot move there', reason);
        update.startDate = startDate;
        // An N-day cadence anchored on the old start follows it, so no day sits before the anchor.
        const cadence = reanchorCadence(
          (rest.cadence ?? c.book.cadence) as Data | undefined,
          oldStart,
          startDate
        );
        if (cadence) update.cadence = cadence;
        // The start-date rate is dated at the start itself: it moves with it.
        if (oldStart && startDate < oldStart) {
          update.rates = moveStartRate(rates, oldStart, startDate);
        }
      }
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
      // Counting a division the book already reads changes nothing.
      if (Object.keys(update).length > 0) tx.update(bookDoc, update);
      // A counted division audits the list stored, never the fallback list sent for an older server.
      const audited =
        addDivision === undefined
          ? action.patch
          : { ...action.patch, divisions: update.divisions ?? storedDivisions };
      return { detail: { patch: audited as Data } };
    }
    case 'recordPayment': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      if ((await tx.get(ref)).exists)
        fail('already-exists', 'A payment with that id exists', 'payment-exists');
      await confirmDeclaration(c, action.declarationId, action.minerId, action.paymentId);
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
        detail: {
          paymentId: action.paymentId,
          minerId: action.minerId,
          amount: action.amount,
          ...(action.declarationId ? { declarationId: action.declarationId } : {}),
        },
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
        notTaxReason: action.reason ?? FieldValue.delete(),
        notTaxBy: by,
        notTaxAt: iso,
      });
      return {
        detail: {
          paymentId: action.paymentId,
          notTaxAmount: action.notTaxAmount,
          ...(action.reason ? { reason: action.reason } : {}),
        },
      };
    }
    case 'ignoreUncounted': {
      const ref = col(c, META).doc(UNCOUNTED_DOC);
      const held = (await tx.get(ref)).data();
      const donations = ((held?.donations as Data[] | undefined) ?? []).filter(
        (u) => u.id !== action.uncountedId
      );
      const ignored = [
        ...((held?.ignored as string[] | undefined) ?? []).filter(
          (id) => id !== action.uncountedId
        ),
        action.uncountedId,
      ].slice(-UNCOUNTED_IGNORED_MAX);
      tx.set(ref, { donations, ignored }, { merge: true });
      return { detail: { uncountedId: action.uncountedId } };
    }
    case 'assignPayment': {
      const ref = col(c, PAYMENTS).doc(action.paymentId);
      const payment = await mustGet(c, ref, 'Payment');
      if (payment.minerId !== undefined)
        fail('failed-precondition', 'Already assigned', 'already-assigned');
      await confirmDeclaration(c, action.declarationId, action.minerId, action.paymentId);
      // An officer placed a held donation: the review it waited for is done (#6207).
      tx.update(ref, {
        minerId: action.minerId,
        assignedBy: by,
        ...(payment.reviewReason !== undefined ? { reviewReason: FieldValue.delete() } : {}),
      });
      return {
        detail: {
          paymentId: action.paymentId,
          minerId: action.minerId,
          ...(action.declarationId ? { declarationId: action.declarationId } : {}),
        },
      };
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
      for (const ids of chunk(wantedIds, 30)) {
        const snap = await c.tx.get(col(c, DISMISSALS).where('targetId', 'in', ids));
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
      // An officer's choice replaces a pilot's start-from-the-pop link (`popSurveyId`).
      tx.update(ref, {
        surveyId: action.surveyId ?? FieldValue.delete(),
        popSurveyId: FieldValue.delete(),
      });
      return { detail: { extractionId: action.extractionId, surveyId: action.surveyId } };
    }
    case 'setFullyMined': {
      const ref = col(c, EXTRACTIONS).doc(action.extractionId);
      await mustGet(c, ref, 'Extraction');
      // Never written by the sync's merge-set, so a later sync keeps the flag. Clearing drops it.
      tx.update(ref, {
        fullyMined: action.fullyMined
          ? { by: by, byName: c.access.characterName, at: iso }
          : FieldValue.delete(),
      });
      return { detail: { extractionId: action.extractionId, fullyMined: action.fullyMined } };
    }
    case 'setMiner': {
      const miners = await tx.get(col(c, MINERS));
      const out = await planMiner(c, miners.docs, action, new Set());
      const scope = rekeyScope(action, [], out.pending);
      const rekey = await rekeyAbsorbed(
        tx,
        c.deps.db,
        c.corporationId,
        action.minerId,
        scope.uids,
        scope.absorbed
      );
      writeMiner(c, action, out);
      rekey();
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
      const scope = rekeyScope(action, action.absorbMinerIds, out.pending);
      const rekey = await rekeyAbsorbed(
        tx,
        c.deps.db,
        c.corporationId,
        action.minerId,
        scope.uids,
        scope.absorbed
      );
      for (const id of absorbed) tx.delete(col(c, MINERS).doc(id));
      writeMiner(c, action, out);
      rekey();
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
      // The Miner reads their own corrections on the personal tab (#4622).
      const uids = await minerUids(c, action.minerId);
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId: action.minerId,
        date: action.date,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        uids,
        ...(action.kind === 'opening' ? { kind: 'opening' } : {}),
      });
      return {
        detail: {
          adjustmentId: id,
          minerId: action.minerId,
          amount: action.amount,
          reason: action.reason,
          ...(action.kind === 'opening' ? { kind: 'opening' } : {}),
        },
        result: { adjustmentId: id },
      };
    }
    case 'reverseAdjustment': {
      const ref = col(c, ADJUSTMENTS).doc(action.adjustmentId);
      const adjustment = await mustGet(c, ref, 'Adjustment');
      await assertAdjustmentReversible(c, action.adjustmentId, adjustment);
      requireDirectorAbove(c, [Math.abs(Number(adjustment.amount))]);
      tx.update(ref, { reversed: { by, at: iso, reason: action.reason } });
      return {
        detail: {
          adjustmentId: action.adjustmentId,
          minerId: adjustment.minerId,
          amount: adjustment.amount,
          reason: action.reason,
        },
      };
    }
    case 'editAdjustment': {
      const ref = col(c, ADJUSTMENTS).doc(action.adjustmentId);
      const adjustment = await mustGet(c, ref, 'Adjustment');
      await assertAdjustmentReversible(c, action.adjustmentId, adjustment);
      // What the edit changes for the Miner: the gate sees that difference, not the whole line.
      requireDirectorAbove(c, [Math.abs(action.amount - Number(adjustment.amount))]);
      const minerId = adjustment.minerId as string;
      const uids = await minerUids(c, minerId);
      const id = `a${now}_${rand(4)}`;
      tx.update(ref, { reversed: { by, at: iso, reason: `Edited: ${action.reason}` } });
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId,
        date: action.date,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        uids,
        replaces: action.adjustmentId,
        ...(adjustment.kind === 'opening' ? { kind: 'opening' } : {}),
      });
      return {
        detail: {
          adjustmentId: id,
          replaces: action.adjustmentId,
          minerId,
          amount: action.amount,
          was: adjustment.amount,
          reason: action.reason,
        },
        result: { adjustmentId: id },
      };
    }
    case 'reverseWriteOff': {
      const ref = col(c, WRITE_OFFS).doc(action.writeOffId);
      const writeOff = await mustGet(c, ref, 'Write-off');
      if (writeOff.reversed) fail('failed-precondition', 'Already reversed', 'already-reversed');
      requireDirectorAbove(c, [Math.abs(Number(writeOff.amount))]);
      // A dispute this write-off answered stays answered: only the forgiveness is undone.
      tx.update(ref, { reversed: { by, at: iso, reason: action.reason } });
      return {
        detail: {
          writeOffId: action.writeOffId,
          minerId: writeOff.minerId,
          amount: writeOff.amount,
          reason: action.reason,
        },
      };
    }
    case 'setToleranceExemption': {
      // Forgiving more than the book would is a write-off, so it meets the same gate; charging a
      // shortfall (0) only raises what is owed.
      if (action.forgive > 0) requireDirectorAbove(c, [action.forgive]);
      const uids = await minerUids(c, action.minerId);
      if (uids.length === 0) fail('not-found', 'Unknown Miner', 'unknown-miner');
      const id = `x${now}_${rand(4)}`;
      tx.create(col(c, TOLERANCE_EXEMPTIONS).doc(id), {
        id,
        minerId: action.minerId,
        date: action.date,
        forgive: action.forgive,
        reason: action.reason,
        by,
        at: iso,
        uids,
      });
      return {
        detail: {
          exemptionId: id,
          minerId: action.minerId,
          date: action.date,
          forgive: action.forgive,
          reason: action.reason,
        },
        result: { exemptionId: id },
      };
    }
    case 'writeOff': {
      const statementDoc = action.statementId
        ? await mustGet(c, col(c, STATEMENTS).doc(action.statementId), 'Statement')
        : undefined;
      if (statementDoc && statementDoc.minerId !== action.minerId)
        fail('invalid-argument', "Statement is another Miner's", 'wrong-miner');
      // A write-off that closes a day closes the Miner's dispute of it too (#6307): answered, so
      // it leaves the officer's Needs you and no longer holds the day from the write-off.
      const mineOpen = (
        await c.tx.get(col(c, DISPUTES).where('minerId', '==', action.minerId))
      ).docs
        .map((d) => d.data())
        .filter(hasLines); // a withdrawn dispute is a tombstone: nothing to answer
      // Every read stays above the first write: a Firestore transaction refuses a read after one.
      const uids = await minerUids(c, action.minerId);
      const closing = disputesClosedByWriteOff(
        mineOpen,
        { amount: action.amount },
        statementDoc as Parameters<typeof disputesClosedByWriteOff>[2]
      );
      const id = `w${now}_${rand(4)}`;
      for (const disputeId of closing)
        tx.update(col(c, DISPUTES).doc(disputeId), {
          resolution: {
            kind: 'dismissed',
            at: iso,
            by,
            reason: action.reason,
            amountIsk: 0,
            writeOffId: id,
          },
        });
      // The book applies it (#4637), and the Miner reads it on the personal tab.
      tx.create(col(c, WRITE_OFFS).doc(id), {
        id,
        minerId: action.minerId,
        amount: action.amount,
        reason: action.reason,
        by,
        at: iso,
        uids,
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
        if (await recordedHereSince(c, characterId, action.fromDate)) touchesMember = true;
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
      refuseCalendarStatement(c, statement);
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
      const wanted = [...new Set(action.statementIds)].filter((id) => !paid.has(id));
      const docs: Data[] = [];
      for (const id of wanted) docs.push(await mustGet(c, col(c, STATEMENTS).doc(id), 'Statement'));
      // A Statement settles for good (D22), so the server never trusts the caller's plan: an
      // older client plans without disputes. One an open dispute holds right now is dropped.
      const held = await heldStatementIds(c, docs, iso);
      // A late notice (#6294) is never settled for good: its days stay on the running account.
      const notices = new Set(docs.filter((d) => !billsDays(d)).map((d) => d.id as string));
      const fresh = wanted.filter((id) => !held.has(id) && !notices.has(id));
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
      const statement = await mustGet(c, col(c, STATEMENTS).doc(action.statementId), 'Statement');
      const id = `x${now}_${rand(4)}`;
      tx.create(col(c, DECLARATIONS).doc(id), {
        id,
        statementId: action.statementId,
        kind: action.kind,
        at: iso,
        recordedBy: by,
        // The Miner reads their own declarations (#6206), as they read the Statement.
        minerId: statement.minerId,
        uids: statement.uids ?? [],
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
          ...(action.nextStep ? { nextStep: action.nextStep } : {}),
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
    case 'dismissDispute': {
      // Only the disputed ore is waived, as a credit on the day (#6206): the rest of the day
      // stays billed. The server prices it from the Statements that billed it, so a client cannot
      // understate it to slip under the Director limit. A day on no Statement yet has no price
      // here: the client's figure stands only for a Director, or a book with no limit.
      const ref = col(c, DISPUTES).doc(action.disputeId);
      const dispute = await mustGet(c, ref, 'Dispute');
      if (!hasLines(dispute)) fail('not-found', 'Dispute not found', 'not-found');
      if (dispute.resolution) fail('failed-precondition', 'Already resolved', 'already-resolved');
      if (dispute.minerId !== action.minerId)
        fail('invalid-argument', "Dispute is another Miner's", 'wrong-miner');
      const lines = (dispute.lines as DisputeConflictInput['lines'] | undefined) ?? [];
      const billing: Data[] = [];
      for (const characterId of new Set(
        lines.map((l) => parseRecordKey(l.recordKey).characterId)
      )) {
        const snap = await tx.get(
          col(c, STATEMENTS).where('characterIds', 'array-contains', characterId)
        );
        billing.push(...snap.docs.map((d) => d.data()));
      }
      const priced = billedDisputeTax(
        {
          lines,
          ...(typeof dispute.kind === 'string' ? { kind: dispute.kind as DisputeKind } : {}),
          ...(typeof dispute.claimedPct === 'number' ? { claimedPct: dispute.claimedPct } : {}),
        },
        billing
      );
      const limit = c.book.dismissApprovalAboveIsk as number | null | undefined;
      if (priced === undefined && action.amountIsk === undefined)
        fail('failed-precondition', 'That ore is not billed yet', 'not-priced');
      if (priced !== undefined && !(priced > 0))
        fail('failed-precondition', 'The disputed ore carries no tax', 'nothing-to-waive');
      const amountIsk = priced ?? (action.amountIsk as number);
      if (dismissalNeedsDirector(limit, [priced], c.access.isDirector)) {
        throw new HttpsError(
          'permission-denied',
          'A Director must approve this size of dismissal',
          { reason: 'director-approval' }
        );
      }
      const uids = await minerUids(c, action.minerId);
      const id = `a${now}_${rand(4)}`;
      tx.create(col(c, ADJUSTMENTS).doc(id), {
        id,
        minerId: action.minerId,
        date: dispute.date,
        amount: -amountIsk,
        reason: action.reason,
        by,
        at: iso,
        uids,
        disputeId: action.disputeId,
      });
      tx.update(ref, {
        resolution: {
          kind: 'dismissed',
          at: iso,
          by,
          reason: action.reason,
          amountIsk,
          adjustmentId: id,
        },
      });
      return {
        detail: {
          disputeId: action.disputeId,
          adjustmentId: id,
          minerId: action.minerId,
          amountIsk,
          reason: action.reason,
        },
        result: { adjustmentId: id },
      };
    }
    case 'rejectDispute': {
      const ref = col(c, DISPUTES).doc(action.disputeId);
      const dispute = await mustGet(c, ref, 'Dispute');
      if (!hasLines(dispute)) fail('not-found', 'Dispute not found', 'not-found');
      if (dispute.resolution) fail('failed-precondition', 'Already resolved', 'already-resolved');
      const nextStep = action.nextStep !== undefined ? { nextStep: action.nextStep } : {};
      tx.update(ref, {
        resolution: { kind: 'rejected', at: iso, by, reason: action.reason, ...nextStep },
      });
      return { detail: { disputeId: action.disputeId, reason: action.reason, ...nextStep } };
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
    case 'recordAccounts': {
      // Every book is a running account (decision 20261117-060555).
      const paidRef = col(c, META).doc(PAID_DOC);
      const settled = await storableSettledThrough(c, action.accounts, paidRef, iso);
      // Every editor's open tab records the same figures (#6313): one already stored is not
      // written again, so a second tab adds no write and no newer `at`/`by`.
      const refs = action.accounts.map((a) => col(c, ACCOUNTS).doc(a.minerId));
      const stored = refs.length > 0 ? await c.tx.getAll(...refs) : [];
      // The Miner's own copy of the paid-through day (the marker itself is officer-only), for each
      // Miner it advanced now. Reads first: a transaction refuses one after a write.
      const advanced = Object.keys(settled);
      const advancedUids = await Promise.all(advanced.map((id) => minerUids(c, id)));
      action.accounts.forEach((account, i) => {
        const a = { ...account };
        delete a.settledThrough; // the pay page's record; the marker lives in `meta/paid`
        if (sameAccount(stored[i].data(), a)) return;
        tx.set(refs[i], { ...a, at: iso, by });
      });
      // Only ever grown: a day recorded paid stays paid, even if money is later taken back (D22).
      if (Object.keys(settled).length > 0)
        tx.set(paidRef, { minerPaidThrough: settled }, { merge: true });
      advanced.forEach((id, i) =>
        tx.set(col(c, MINER_PAID).doc(id), { id, paidThrough: settled[id], uids: advancedUids[i] })
      );
      // The figures as recorded, so the audit says what the pay page was told.
      return { detail: { count: action.accounts.length, accounts: action.accounts } };
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
    case 'setPopSharing':
    case 'setPopSharingMoon':
      return applyPopSharingEdit(c, action);
  }
}

/**
 * Pop Sharing settings (#6222): the switch, the Sharing default and Moon overrides, in
 * `meta/popSharing`. Turning sharing on needs Automatic sync running; a Moon override must
 * name a moon the book has an Extraction for (its own or a moon owner's). Every Extraction ever
 * synced is kept, past and cancelled ones too, so a refinery between cycles keeps its moon; one
 * with no Extraction yet has no known moon (#6240).
 */
async function applyPopSharingEdit(
  c: EditCtx,
  action: Extract<EditAction, { action: 'setPopSharing' | 'setPopSharingMoon' }>
): Promise<EditOutcome> {
  const ref = col(c, META).doc(POP_SHARING_DOC);
  const current = popSharingFrom((await c.tx.get(ref)).data());
  const next = { ...current, moons: { ...current.moons } };
  let detail: Data;
  // Turning sharing on stamps the book's editing officers: their uses went unstamped while the
  // book had no Pop Sharing settings (`stampEditorUseIfSharing`). The officer who turns it on now;
  // each other editing officer at its last role check (its record lives a day).
  const turningOn =
    action.action === 'setPopSharing' && action.enabled === true && !current.enabled;
  let editors: { characterId: number; ownerHash: string; at: number }[] = [];
  if (action.action === 'setPopSharing') {
    if (turningOn) {
      const sync = (await c.tx.get(col(c, META).doc(SCHEDULED_SYNC_DOC))).data();
      if (sync?.status !== 'active')
        fail('failed-precondition', 'Pop Sharing needs Automatic sync', 'needs-automatic-sync');
      editors = (await c.tx.get(col(c, OFFICERS))).docs.flatMap((d) => {
        const o = d.data() as Partial<OfficerAccess>;
        return o.canEdit === true &&
          typeof o.characterId === 'number' &&
          typeof o.ownerHash === 'string' &&
          typeof o.checkedAt === 'number' &&
          o.characterId !== c.access.characterId
          ? [{ characterId: o.characterId, ownerHash: o.ownerHash, at: o.checkedAt }]
          : [];
      });
      editors.push({ ...c.access, at: c.now });
    }
    if (action.enabled !== undefined) next.enabled = action.enabled;
    if (action.defaults) next.defaults = { ...current.defaults, ...action.defaults };
    detail = {
      ...(action.enabled === undefined ? {} : { enabled: action.enabled }),
      ...(action.defaults ? { defaults: action.defaults } : {}),
    };
  } else {
    const known = await c.tx.get(col(c, EXTRACTIONS).where('moonId', '==', action.moonId).limit(1));
    if (known.empty) fail('not-found', 'This book has no such moon', 'unknown-moon');
    const key = String(action.moonId);
    const override = applyMoonOverride(current.moons[key], action.override);
    if (override) next.moons[key] = override;
    else delete next.moons[key];
    detail = { moonId: action.moonId, set: action.override.set, clear: action.override.clear };
  }
  c.tx.set(ref, { ...next, updatedAt: c.now, updatedBy: c.access.characterId });
  for (const e of editors)
    c.tx.set(sharedPopSourcesRef(c.deps.db, c.corporationId), editorStampFields(e, e.at), {
      merge: true,
    });
  return { detail };
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

/** A running account bills by day (#6294): an older client's calendar Statement is refused. */
function refuseCalendarStatement(c: { book: Data }, statement: { kind?: string }): void {
  if (typeof c.book.runningAccountFrom === 'string' && statement.kind !== 'notice')
    fail(
      'failed-precondition',
      'This book bills a running account: only late notices are issued',
      'running-account'
    );
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
    const latest = await latestRecordedCorpOf(c, characterId);
    if (latest === c.corporationId)
      fail('failed-precondition', "Only a guest's account can be closed", 'not-a-guest');
  }

  const statement = action.statement ? parseStatement(action.statement) : undefined;
  if (statement && statement.minerId !== action.minerId)
    fail('invalid-argument', "Statement is another Miner's", 'wrong-miner');
  if (statement) refuseCalendarStatement(c, statement);

  // The credit the guest is left with once the final Statement is counted.
  const [statements, payments, dismissals, extractions, writeOffs] = await Promise.all([
    tx.get(col(c, STATEMENTS).where('minerId', '==', action.minerId)),
    tx.get(col(c, PAYMENTS).where('minerId', '==', action.minerId)),
    tx.get(col(c, DISMISSALS)),
    tx.get(col(c, EXTRACTIONS)),
    tx.get(col(c, WRITE_OFFS).where('minerId', '==', action.minerId)),
  ]);
  // A running account's notices bill no days of their own (#6294): legacy Statements only.
  const held = statements.docs.map((d) => d.data() as Data).filter(billsDays);
  const allocation = allocatePayments({
    statements: [...held, ...(statement && billsDays(statement) ? [statement] : [])].map((x) => ({
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
    officerWriteOffs: writeOffs.docs.flatMap((d) => writeOffForAllocation(d.data()) ?? []),
    startDate: c.book.startDate as string | undefined,
  });
  // Payments that paid running days are no credit; only the officer's client can price those days.
  // Every book is a running account (decision 20261117-060555): the client's credit when sent.
  const credit = Math.max(
    0,
    action.runningCredit !== undefined ? action.runningCredit : allocation.credit
  );
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

/** Rebuilds the moon docs an edit changed; an expiry change or a regroup rebuilds every pull. */
async function refreshMoonDocsAfterEdit(
  db: Firestore,
  corporationId: number,
  action: EditAction
): Promise<void> {
  try {
    if (action.action === 'linkSurvey') {
      await refreshMoonDocs(db, corporationId, [action.extractionId]);
    } else if (action.action === 'issueStatement') {
      const days = (parseStatement(action.statement).lines as unknown as Data[]).flatMap((l) =>
        typeof l.structureId === 'number' && typeof l.date === 'string'
          ? [{ structureId: l.structureId, date: l.date }]
          : []
      );
      await refreshMoonDocs(db, corporationId, await pullsOfDays(db, corporationId, days));
    } else if (
      (action.action === 'updateSettings' && action.patch.structureExpiryHours) ||
      action.action === 'setMiner' ||
      action.action === 'unlink' ||
      action.action === 'regroupMiner'
    ) {
      const snap = await sub(db, corporationId, EXTRACTIONS).get();
      await refreshMoonDocs(
        db,
        corporationId,
        snap.docs.map((d) => d.id)
      );
    }
  } catch (e) {
    console.error('moon docs refresh failed', e instanceof Error ? e.message : e);
  }
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
  const result = await deps.db.runTransaction(async (tx) => {
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
    const actor = actorOf(access, via);
    // `addRates` is never an audit action itself: it always returns its own per-rate `audits`.
    for (const a of outcome.audits ?? [
      { action: action.action as AuditAction, detail: outcome.detail },
    ])
      appendAudit(tx, deps, call.corporationId, actor, a.action, a.detail);
    return outcome.result ?? {};
  });
  // The edit changed some Miners' frozen totals (ADR 0032). Best effort: the verifier repairs.
  await refreshAfterEvent(deps.db, call.corporationId, editScope(action), deps.now);
  // Statements freeze a pull's tax, and a survey link or expiry changes its doc (ADR 0032). Best effort.
  await refreshMoonDocsAfterEdit(deps.db, call.corporationId, action);
  // The same edits move the Overview and Miners tab docs (ADR 0032). Best effort.
  const scope = editScope(action);
  if (
    scope.all ||
    scope.minerIds.length + scope.statementIds.length + scope.paymentIds.length > 0 ||
    action.action === 'linkSurvey'
  )
    await refreshReadModels(deps.db, call.corporationId, deps.now());
  // A changed expiry moves which days a pull covers, so its rows' stamps (ADR 0032). Best effort.
  if (action.action === 'updateSettings' && action.patch.structureExpiryHours) {
    await restampStructures(
      deps.db,
      call.corporationId,
      Object.keys(action.patch.structureExpiryHours).map(Number)
    ).catch((e) => console.error('expiry restamp failed', e instanceof Error ? e.message : e));
  }
  // Settings, a rate, an expiry or a survey change what the book's Shared Pops say (#6223).
  if (SHARED_POP_EDITS.has(action.action)) await refreshSharedPops(deps, call.corporationId);
  return result;
}

/** Edits that change a Shared Pop: its settings, its rate, its expiry or its ore. */
const SHARED_POP_EDITS = new Set<EditAction['action']>([
  'setPopSharing',
  'setPopSharingMoon',
  'updateSettings',
  'addRate',
  'addRates',
  'linkSurvey',
]);

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
  const characterId = signedInCharacter(caller);
  const ref = sub(deps.db, corporationId, MINERS).doc(minerId);
  await deps.db.runTransaction(async (tx) => {
    const miner = (await tx.get(ref)).data();
    if (!miner || !(miner.pendingConfirmation as number[]).includes(characterId)) {
      fail('not-found', 'Nothing to confirm', 'nothing-pending');
    }
    // Joining is when the guest's own records follow it into the group (#6450).
    const rekey = await rekeyAbsorbed(
      tx,
      deps.db,
      corporationId,
      minerId,
      [...new Set([...((miner.uids as string[] | undefined) ?? []), caller.uid])],
      [`solo:${characterId}`]
    );
    tx.update(ref, {
      pendingConfirmation: (miner.pendingConfirmation as number[]).filter((x) => x !== characterId),
      confirmedCharacterIds: FieldValue.arrayUnion(characterId),
      uids: FieldValue.arrayUnion(caller.uid),
    });
    rekey();
    recordAnswer(tx, deps, corporationId, characterId, {
      minerId,
      answer: 'confirmed',
      via: 'character',
    });
    appendAudit(tx, deps, corporationId, { characterId, name: '' }, 'confirmGrouping', { minerId });
  });
  await refreshAfterEvent(deps.db, corporationId, [minerId], deps.now);
  await refreshReadModels(deps.db, corporationId, deps.now());
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
  await refreshAfterEvent(deps.db, corporationId, [minerId, `solo:${characterId}`], deps.now);
  await refreshReadModels(deps.db, corporationId, deps.now());
}

/** The added character itself declines, signed in as itself. */
export async function declineGrouping(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  minerId: string
) {
  const characterId = signedInCharacter(caller);
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
  const characterId = signedInCharacter(caller);
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
  paymentId: string,
  options: { inReview?: boolean } = {}
) {
  const claimed = await claimPaymentTx(deps, caller, corporationId, paymentId, options);
  await refreshAfterEvent(deps.db, corporationId, [claimed.minerId], deps.now);
  await refreshReadModels(deps.db, corporationId, deps.now());
  return claimed;
}

async function claimPaymentTx(
  deps: BookDeps,
  caller: Caller,
  corporationId: number,
  paymentId: string,
  options: { inReview?: boolean }
) {
  const characterId = signedInCharacter(caller);
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
    // #6207: held because the player's Miner owed nothing (a buyback, say): an officer decides,
    // unless the player says it was tax (`inReview`, never the automatic claim). Only one paid on
    // or after the book's start: mining before it is never billed, so nothing was owed then.
    const inReview = payment.reviewReason !== undefined;
    if (inReview && (!options.inReview || payment.reviewReason !== 'no-open-balance'))
      fail('failed-precondition', 'An officer reviews this payment', 'in-review');
    if (inReview && String(payment.at ?? '').slice(0, 10) < String(book.get('startDate') ?? ''))
      fail('failed-precondition', 'Paid before the book started', 'before-start');
    // A guest's character stays unlinked until they confirm (D26b): `callerMiner` counts only a
    // Miner that lists this character in its readable `uids`.
    const { minerId } = await callerMiner(tx, deps, corporationId, caller, characterId);
    tx.update(paymentRef, {
      minerId,
      claimedBy: characterId,
      claimedAt: new Date(deps.now()).toISOString(),
      ...(inReview ? { reviewReason: FieldValue.delete() } : {}),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player claim', via: 'player-claim' },
      'claimPayment',
      { paymentId, minerId, ...(inReview ? { inReview: true } : {}) }
    );
    return { minerId };
  });
}

/**
 * The book a member writes to (#6206): it must exist, be on, and be past its setup
 * window, as the member read path shows it. Read inside the transaction.
 */
async function memberBook(tx: Transaction, deps: BookDeps, corporationId: number): Promise<void> {
  const book = await tx.get(bookRef(deps.db, corporationId));
  if (!book.exists || book.get('active') !== true)
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  const seeFrom = book.get('membersSeeFrom') as unknown;
  if (typeof seeFrom === 'number' && deps.now() < seeFrom)
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
}

/**
 * The Miner the caller's character belongs to, as `claimPayment` finds it: a grouping that lists
 * the caller's sign-in in its `uids` (a guest's unconfirmed character does not count), else a Miner
 * of its own. `uids` are that Miner's confirmed sign-ins.
 */
async function callerMiner(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  caller: Caller,
  characterId: number
): Promise<{ minerId: string; uids: string[] }> {
  const grouped = await tx.get(
    sub(deps.db, corporationId, MINERS).where('characterIds', 'array-contains', characterId)
  );
  const miner = grouped.docs.find((d) => (d.get('uids') as string[]).includes(caller.uid));
  return miner
    ? { minerId: miner.id, uids: miner.get('uids') as string[] }
    : { minerId: `solo:${characterId}`, uids: [caller.uid] };
}

/**
 * A Miner's own "I paid this another way" (#6206): a declaration on one of their own
 * unsettled Statements, with an optional amount and note. No officer role: the caller's
 * sign-in must be one the Statement lists (`uids`, the same proof the rules give the member
 * read), and the answer for someone else's Statement is the same as for a missing one. It
 * pauses the Overdue clock like an officer-recorded declaration, until an officer answers.
 */
export async function declareOwnPayment(deps: BookDeps, caller: Caller, input: DeclareOwnInput) {
  const characterId = signedInCharacter(caller);
  const { corporationId, statementId } = input;
  const declared = await deps.db.runTransaction(async (tx) => {
    await memberBook(tx, deps, corporationId);
    const statementSnap = await tx.get(sub(deps.db, corporationId, STATEMENTS).doc(statementId));
    const statement = statementSnap.data();
    if (!statement || !((statement.uids as string[] | undefined) ?? []).includes(caller.uid))
      fail('not-found', 'Statement not found', 'not-found');
    const paid = (await tx.get(sub(deps.db, corporationId, META).doc(PAID_DOC))).data();
    if (((paid?.ids as string[] | undefined) ?? []).includes(statementId))
      fail('failed-precondition', 'This Statement is settled', 'settled');
    const open = await tx.get(
      sub(deps.db, corporationId, DECLARATIONS).where('statementId', '==', statementId)
    );
    if (open.docs.some((d) => d.get('resolution') === undefined))
      fail('already-exists', 'A declaration is already waiting', 'already-declared');
    // Resolving in the app: the transfers are checked against what the book synced of the
    // corporation's wallet before any officer sees them.
    const transfers = input.transfers ?? [];
    const checks =
      transfers.length > 0
        ? await checkTransfers(tx, deps, corporationId, statement.uids as string[], transfers)
        : ([] as ClaimCheck[]);
    // Every transfer found in the book: confirmed at once, nobody had to look.
    const allFound = checks.length > 0 && checks.every((c) => c.result === 'found');
    const now = deps.now();
    const iso = new Date(now).toISOString();
    // Each payment found is credited at once, even while others are not: the declaration stays
    // open for the rest. A found payment is one no one held yet (`checkClaimedTransfer`).
    // One the sync held for review is the member's own money too: crediting it ends the hold.
    for (const c of checks) {
      if (c.result === 'found' && c.paymentId)
        tx.update(sub(deps.db, corporationId, PAYMENTS).doc(c.paymentId), {
          minerId: statement.minerId,
          claimedBy: characterId,
          claimedAt: iso,
          reviewReason: FieldValue.delete(),
        });
    }
    const id = `x${now}_${rand(4)}`;
    tx.create(sub(deps.db, corporationId, DECLARATIONS).doc(id), {
      id,
      statementId,
      kind: 'another-way',
      at: iso,
      recordedBy: characterId,
      via: 'player',
      minerId: statement.minerId,
      uids: statement.uids,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(transfers.length > 0 ? { transfers, checks } : {}),
      // By the system (0): the book itself holds every transfer.
      ...(allFound
        ? {
            resolution: {
              kind: 'confirmed',
              at: iso,
              by: 0,
              reason: "Found in the corporation's wallet",
            },
          }
        : {}),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player declaration', via: 'player-claim' },
      'declare',
      {
        declarationId: id,
        statementId,
        kind: 'another-way',
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
      }
    );
    return { declarationId: id, minerId: statement.minerId as string, checks, confirmed: allFound };
  });
  await refreshAfterEvent(deps.db, corporationId, [declared.minerId], deps.now);
  await refreshReadModels(deps.db, corporationId, deps.now());
  return {
    declarationId: declared.declarationId,
    checks: declared.checks,
    confirmed: declared.confirmed,
  };
}

/**
 * Checks each claimed transfer against the book (`checkClaimedTransfers`): the payments the
 * Miner's own characters sent that no one holds yet, the donations noted in divisions the book
 * does not read, its last sync and its start.
 */
async function checkTransfers(
  tx: Transaction,
  deps: BookDeps,
  corporationId: number,
  uids: readonly string[],
  transfers: readonly ClaimTransfer[]
): Promise<ClaimCheck[]> {
  const senderIds = uids.flatMap((u) => (u.startsWith('char:') ? [Number(u.slice(5))] : []));
  const book = (await tx.get(bookRef(deps.db, corporationId))).data() ?? {};
  const payments =
    senderIds.length === 0
      ? []
      : (
          await tx.get(
            sub(deps.db, corporationId, PAYMENTS).where('characterId', 'in', senderIds.slice(0, 30))
          )
        ).docs.map((d): Data & { id: string } => ({ ...(d.data() as Data), id: d.id }));
  const uncounted =
    ((await tx.get(sub(deps.db, corporationId, META).doc(UNCOUNTED_DOC))).data()?.donations as
      { characterId: number; amount: number; at: string; division: number }[] | undefined) ?? [];
  const lastSyncAt = (book.lastSync as { at?: number } | null | undefined)?.at;
  return checkClaimedTransfers(transfers, {
    senderIds,
    payments: payments.map((p) => ({
      id: p.id,
      characterId: p.characterId as number | undefined,
      amount: p.amount as number,
      at: p.at as string,
      ...(typeof p.minerId === 'string' ? { minerId: p.minerId } : {}),
      ...(typeof p.notTaxAmount === 'number' ? { notTaxAmount: p.notTaxAmount } : {}),
      ...(p.reviewReason !== undefined ? { reviewReason: String(p.reviewReason) } : {}),
    })),
    uncounted,
    lastSyncAt: typeof lastSyncAt === 'number' ? lastSyncAt : undefined,
    ...(typeof book.startDate === 'string' ? { startDate: book.startDate } : {}),
  });
}

/**
 * A Miner flags a Conflict day to the book (#6206): "I gave this ore to {payee}". One record
 * per Miner and day; a second flag for the same day adds its lines. Every line's character
 * must be one of the caller's own Miner's confirmed characters. A day an officer waived cannot be flagged again; one whose bill
 * the officer kept can, once more with the old answer in `history` and the hold not renewed. Officers answer in Needs you: dismiss the day, or reject.
 */
export async function disputeConflict(deps: BookDeps, caller: Caller, input: DisputeConflictInput) {
  const characterId = signedInCharacter(caller);
  const { corporationId, date } = input;
  let touched = '';
  const result = await deps.db.runTransaction(async (tx) => {
    await memberBook(tx, deps, corporationId);
    const { minerId, uids } = await callerMiner(tx, deps, corporationId, caller, characterId);
    touched = minerId;
    const characters = new Set<number>();
    for (const line of input.lines) {
      const lineCharacter = parseRecordKey(line.recordKey).characterId;
      if (!uids.includes(`char:${lineCharacter}`))
        fail('permission-denied', 'Not your ore', 'not-your-record');
      characters.add(lineCharacter);
    }
    const disputeId = disputeIdFor(minerId, date);
    const ref = sub(deps.db, corporationId, DISPUTES).doc(disputeId);
    const stored = (await tx.get(ref)).data();
    // A waived day stays closed. A bill the officer kept may be disputed again, with the
    // answer moved into `history` and the first dispute's hold window kept.
    // A withdrawn day is a tombstone (no `lines`: every reader drops it) that keeps `holdFrom`
    // and `history`, so withdrawing and filing again does not renew the hold.
    const tombstone = stored !== undefined && !hasLines(stored);
    const answer = stored?.resolution as { kind?: string } | undefined;
    if (answer && answer.kind !== 'rejected')
      fail('failed-precondition', 'An officer answered this day', 'rejected');
    const again = answer !== undefined || tombstone;
    const held = again ? undefined : stored;
    // One thing said per day: a second call adds lines to the same kind, never a different one.
    if (held && ((held.kind as string | undefined) ?? 'payee') !== input.kind)
      fail('already-exists', 'This day already has a dispute', 'already-disputed');
    const heldLines = (held?.lines as DisputeConflictInput['lines'] | undefined) ?? [];
    for (const line of heldLines) characters.add(parseRecordKey(line.recordKey).characterId);
    // The ore each line names, held or new, must be on the book's record, no more than recorded.
    const recorded: RecordedOre[] = [];
    for (const id of characters) {
      const rows = await tx.get(
        sub(deps.db, corporationId, OBSERVED)
          .where('characterId', '==', id)
          .where('date', '==', date)
      );
      for (const r of rows.docs) recorded.push(r.data() as RecordedOre);
    }
    const lines = mergeDisputeLines(heldLines, input.lines, recorded);
    const iso = new Date(deps.now()).toISOString();
    // A payee dispute is stored as before (no `kind`), so a reader older than kinds still reads it.
    const said = {
      ...(input.kind !== 'payee' ? { kind: input.kind } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.claimedPct !== undefined ? { claimedPct: input.claimedPct } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };
    if (held) {
      tx.update(ref, { lines, uids, updatedAt: iso, ...said });
    } else if (stored) {
      // Filed again after a kept bill: the old record's answer joins `history` (additive; a
      // reader older than this one ignores it), and the hold does not renew.
      const past = tombstone
        ? undefined
        : {
            kind: (stored.kind as string | undefined) ?? 'payee',
            ...(typeof stored.reason === 'string' ? { reason: stored.reason } : {}),
            resolution: stored.resolution,
          };
      tx.set(ref, {
        id: disputeId,
        minerId,
        date,
        lines,
        by: characterId,
        at: iso,
        holdFrom:
          (stored.holdFrom as string | undefined) ?? (stored.at as string | undefined) ?? iso,
        updatedAt: iso,
        uids,
        history: [...((stored.history as unknown[] | undefined) ?? []), ...(past ? [past] : [])],
        ...said,
      });
    } else {
      tx.create(ref, {
        id: disputeId,
        minerId,
        date,
        lines,
        by: characterId,
        at: iso,
        updatedAt: iso,
        uids,
        ...said,
      });
    }
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player dispute', via: 'player-claim' },
      'disputeConflict',
      { disputeId, minerId, date, kind: input.kind, lines: input.lines.length }
    );
    return { disputeId };
  });
  // A dispute holds its Statement's disputed amount, so the Miner's stored totals move (best effort).
  await refreshAfterEvent(deps.db, corporationId, [touched], deps.now);
  return result;
}

/**
 * A Miner takes back their own dispute of a day while no officer has answered it: it leaves
 * Needs you and the day is billed as before. Authorised as the dispute was (the caller's own
 * Miner); anyone else's, or one already answered, is refused. Audited.
 */
export async function withdrawDispute(deps: BookDeps, caller: Caller, input: WithdrawDisputeInput) {
  const characterId = signedInCharacter(caller);
  const { corporationId, date } = input;
  let touched = '';
  const result = await deps.db.runTransaction(async (tx) => {
    await memberBook(tx, deps, corporationId);
    const { minerId } = await callerMiner(tx, deps, corporationId, caller, characterId);
    touched = minerId;
    const disputeId = disputeIdFor(minerId, date);
    const ref = sub(deps.db, corporationId, DISPUTES).doc(disputeId);
    const held = (await tx.get(ref)).data();
    if (!held || held.minerId !== minerId || !hasLines(held))
      fail('not-found', 'Dispute not found', 'not-found');
    if (held.resolution) fail('failed-precondition', 'An officer answered this day', 'answered');
    // A tombstone, not a delete: with `lines` gone every reader (older clients included) sees no
    // dispute, but `holdFrom` and `history` stay so filing again keeps the first hold window.
    tx.set(ref, {
      id: disputeId,
      minerId,
      date,
      uids: held.uids,
      holdFrom: (held.holdFrom as string | undefined) ?? (held.at as string),
      ...(Array.isArray(held.history) ? { history: held.history } : {}),
      withdrawnAt: new Date(deps.now()).toISOString(),
    });
    appendAudit(
      tx,
      deps,
      corporationId,
      { characterId, name: 'Player dispute withdrawal', via: 'player-claim' },
      'withdrawDispute',
      { disputeId, minerId, date }
    );
    return { disputeId };
  });
  // The hold is released: the Miner's stored totals count the amount as due again (best effort).
  await refreshAfterEvent(deps.db, corporationId, [touched], deps.now);
  return result;
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
  const [
    book,
    statements,
    payments,
    dismissals,
    extractions,
    paid,
    declarations,
    miner,
    writeOffs,
    account,
  ] = await Promise.all([
    bookRef(deps.db, corporationId).get(),
    sub(deps.db, corporationId, STATEMENTS).where('minerId', '==', minerId).get(),
    sub(deps.db, corporationId, PAYMENTS).where('minerId', '==', minerId).get(),
    sub(deps.db, corporationId, DISMISSALS).get(),
    sub(deps.db, corporationId, EXTRACTIONS).get(),
    sub(deps.db, corporationId, META).doc(PAID_DOC).get(),
    sub(deps.db, corporationId, DECLARATIONS).where('statementId', '==', statementId).get(),
    sub(deps.db, corporationId, MINERS).doc(minerId).get(),
    sub(deps.db, corporationId, WRITE_OFFS).where('minerId', '==', minerId).get(),
    sub(deps.db, corporationId, ACCOUNTS).doc(minerId).get(),
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
    'kind',
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
  // A running account's notices bill no days of their own (#6294): legacy Statements only.
  const billing = statements.docs.filter((d) => billsDays(d.data()));
  const allocation = allocatePayments({
    statements: billing.map((d) => {
      const x = d.data();
      return { id: d.id, amount: x.amount as number, issuedAt: x.issuedAt as string };
    }),
    payments: payments.docs.map((d) => paymentForAllocation(d.id, d.data())),
    dismissalCredits: dismissalCredits({
      minerId,
      statements: billing.map((d) => ({
        id: d.id,
        lines: (d.data().lines as DismissableLine[]) ?? [],
      })),
      dismissals: dismissals.docs.map((d) => d.data() as MirrorDismissal),
      extractions: extractions.docs.map((d) => d.data() as MirrorExtraction),
      expiryHours: (b.structureExpiryHours as Record<string, number> | undefined) ?? {},
    }),
    officerWriteOffs: writeOffs.docs.flatMap((d) => writeOffForAllocation(d.data()) ?? []),
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
      // The corp's own names for them, so the verify page names the Account to pay into (#6204).
      divisionNames: b.divisionNames,
      cadence: b.cadence,
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
    // A running account's total now (#6294): what an officer's client last worked out, less the
    // payments credited to this Miner since. Days mined since then show once it recounts.
    account: account.exists
      ? liveAccount(
          account.data() as Data,
          payments.docs.map((d) => d.data())
        )
      : null,
    // The Miner's whole history for the ledger: every mined day once, and every payment.
    ledger: {
      days: ledgerDays(statements.docs.map((d) => d.data())),
      payments: ledgerPayments(
        payments.docs.map((d) => ({ id: d.id, data: d.data() })),
        b.startDate as string | undefined
      ),
    },
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
